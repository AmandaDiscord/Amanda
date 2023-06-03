/* eslint-disable @typescript-eslint/no-explicit-any */

// From HTML
const channelID = _channelID
let serverTimeDiff = _serverTimeDiff

import { Player, Queue, VoiceInfo, SideControls } from "./classes.js"
import { q, opcodes, generateNonce } from "./utilities.js"
import { ListenManager } from "./wrappers/ListenManager.js"

import type { Queue as WebQueue } from "../../runtime-website/src/music/queue.js"
import type { Track as WebTrack } from "../../runtime-website/src/music/tracktypes.js"

export class Session {
	public state: ReturnType<WebQueue["toJSON"]> | null = null
	public player: Player<HTMLElement>
	public queue: Queue<HTMLElement>
	public voiceInfo: VoiceInfo<HTMLElement>
	public sideControls: SideControls<HTMLElement>
	public listenManager: ListenManager

	public constructor(public ws: WebSocket) {
		this.player = new Player(q("#player-container")!, this)
		this.queue = new Queue(q("#queue-container")!, this)
		this.voiceInfo = new VoiceInfo(q("#voice-info")!)
		this.sideControls = new SideControls(q("#side-controls")!, this)
		this.listenManager = new ListenManager()

		const opcodeMethodMap = new Map<typeof opcodes[keyof typeof opcodes], string>([
			[opcodes.ACKNOWLEDGE, "acknowledge"],
			[opcodes.STATE, "updateState"],
			[opcodes.TRACK_ADD, "trackAdd"],
			[opcodes.NEXT, "next"],
			[opcodes.TRACK_UPDATE, "trackUpdate"],
			[opcodes.TIME_UPDATE, "timeUpdate"],
			[opcodes.TRACK_REMOVE, "trackRemove"],
			[opcodes.LISTENERS_UPDATE, "listenersUpdate"],
			[opcodes.ATTRIBUTES_CHANGE, "attributesChange"],
			[opcodes.CLEAR_QUEUE, "clearQueue"]
		])

		this.ws.addEventListener("open", () => this.onOpen())
		this.ws.addEventListener("close", event => this.onClose(event))
		this.ws.addEventListener("error", console.error)
		this.ws.addEventListener("message", event => {
			console.log("%c[WS ←]", "color: blue", event.data)
			const data = JSON.parse(event.data)
			const method = opcodeMethodMap.get(data.op)
			if (method) this[method](data)
		})
	}

	public send(data): void {
		if (!data.nonce) data.nonce = generateNonce()
		const message = JSON.stringify(data)
		console.log("%c[WS →]", "color: #c00000", message)
		this.ws.send(message)
	}

	public onOpen(): void {
		this.send({
			op: opcodes.IDENTIFY,
			d: {
				cookie: document.cookie,
				channel_id: channelID,
				timestamp: Date.now()
			}
		})
	}

	public onClose(event: CloseEvent): void {
		console.log("WebSocket closed.", event)
	}

	public acknowledge(data: { d: { serverTimeDiff: number } }): void {
		if (!data.d) return
		serverTimeDiff = data.d.serverTimeDiff
		console.log("Time difference: " + serverTimeDiff)
		this.sideControls.mainLoaded = true
		this.sideControls.render()
	}

	public updateState(data: { d: ReturnType<WebQueue["toJSON"]> }): void {
		const oldState = this.state
		this.state = data.d || null
		if (this.state === null) {
			q("#voice-channel-name")!.textContent = "Nothing playing"
			this.player.setTrack(null)
			this.player.updateAttributes({ loop: false })
			this.resetTime()
			this.queue.replaceItems([])
			this.listenManager.stop()
		} else {
			q("#voice-channel-name")!.textContent = this.state.voiceChannel.name
			this.player.setTrack(this.state.tracks[0])
			this.player.updateAttributes(this.state.attributes)
			this.queue.replaceItems(this.state.tracks.slice(1))
			this.queue.isFirstAdd = false
			this.updatePlayerTime()
			if (oldState === null && this.state.tracks[0]) {
				this.listenManager.next(this.state.tracks[0])
			}
		}
		this.sideControls.render()
		this.listenersUpdate(data)
	}

	public listenersUpdate(data: { d: ReturnType<WebQueue["toJSON"]> }): void {
		if (data && this.state) {
			this.state.members = data.d.members
			this.voiceInfo.setMembers(this.state.members)
		} else {
			this.voiceInfo.setMembers([])
		}
	}

	public trackAdd(data: { d: { position: number; track: ReturnType<WebTrack["toObject"]> } }): void {
		if (!this.state) return
		this.state.tracks.splice(data.d.position, 0, data.d.track)
		if (this.state.tracks.length == 1) {
			this.player.setTrack(data.d.track)
			this.updatePlayerTime()
			this.listenManager.next(data.d.track)
		} else this.queue.addItem(data.d.track, data.d.position)
	}

	public trackRemove(data: { d: { index: number } }): void {
		if (!this.state) return
		const index = data.d.index
		this.queue.removeIndex(index - 1) // -1 because frontend does not hold current track but backend does
		this.state.tracks.splice(index, 1) // same reason
	}

	public clearQueue(): void {
		if (!this.state) return
		this.queue.removeAllTracks()
		this.state.tracks.splice(1)
	}

	public next(): void {
		if (!this.state) return
		this.state.tracks.shift()
		this.queue.shift()
		this.resetTime()
		this.player.setTrack(this.state.tracks[0] || null)
		this.listenManager.next(this.state.tracks[0])
	}

	public trackUpdate(data: { d: { index: number; track: ReturnType<WebTrack["toObject"]> } }): void {
		if (!this.state) return
		const track = data.d.track
		const index = data.d.index
		Object.assign(this.state.tracks[index], track)
		if (index == 0) this.player.updateData(track)
		else this.queue.children[index - 1].updateData(track)
	}

	public timeUpdate(data: { d: { playing: boolean } }): void {
		if (!this.state) return
		if (data.d.playing && !this.state.playing) this.listenManager.resume()
		else if (!data.d.playing && this.state.playing) this.listenManager.pause()
		Object.assign(this.state, data.d)
		this.updatePlayerTime()
	}

	public resetTime(): void {
		if (this.state) {
			Object.assign(this.state, { trackStartTime: 0, maxTime: 0, playing: false })
			this.updatePlayerTime()
		}
	}

	public updatePlayerTime(): void {
		if (!this.state) return
		this.player.updateTime({
			playing: this.state.playing,
			trackStartTime: this.state.trackStartTime,
			pausedAt: this.state.pausedAt ?? 0,
			maxTime: this.state.tracks?.[0] ? this.state.tracks[0].length : 0,
			live: this.state.tracks?.[0].live ?? false
		})
	}

	public togglePlayback(): void {
		this.send({
			op: opcodes.TOGGLE_PLAYBACK
		})
	}

	public skip(): void {
		this.send({
			op: opcodes.SKIP
		})
	}

	public stop() {
		this.send({
			op: opcodes.STOP
		})
	}

	public attributesChange(data: { d: { loop?: boolean } }): void {
		if (!this.state) return
		Object.assign(this.state.attributes, data.d)
		this.player.updateAttributes(this.state.attributes)
	}

	public requestAttributesChange(data: { loop?: boolean }): void {
		this.send({
			op: opcodes.ATTRIBUTES_CHANGE,
			d: data
		})
	}
}

const ws = (function() {
	const origin = window.location.origin.replace("http", "ws")
	return new WebSocket(`${origin}/public`)
})()

window.session = new Session(ws)
