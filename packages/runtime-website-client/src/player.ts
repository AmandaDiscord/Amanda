/* eslint-disable no-undef */
// From HTML
const channelID = _channelID
let serverTimeDiff = _serverTimeDiff

import "./global"

import { Player, Queue, VoiceInfo, SideControls, toast } from "./classes.js"
import { q, opcodes, generateNonce } from "./utilities.js"
import { ListenManager } from "./wrappers/ListenManager.js"

import type { Queue as WebQueue } from "../../runtime-website/src/music/queue.js"
import type { Track as WebTrack } from "../../runtime-website/src/music/tracktypes.js"

type WebQueueJSON = ReturnType<WebQueue["toJSON"]>
type WebTrackJSON = ReturnType<WebTrack["toObject"]>

export class Session {
	public state: WebQueueJSON | null = null
	public readonly player: Player<HTMLElement> = new Player(q("#player-container")!, this)
	public readonly queue: Queue<HTMLElement> = new Queue(q("#queue-container")!, this)
	public readonly voiceInfo: VoiceInfo<HTMLElement> = new VoiceInfo(q("#voice-info")!)
	public readonly sideControls: SideControls<HTMLElement> = new SideControls(q("#side-controls")!, this)
	public readonly listenManager: ListenManager = new ListenManager()

	public ws: WebSocket | null = null
	public connectionState: "connecting" | "connected" | "reconnecting" | "dead" = "connecting"
	public deadReason = ""
	private reconnectAttempts = 0
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private readonly pendingActions = new Map<number, () => void>()

	private readonly opcodeMethodMap = new Map<
		number,
		"acknowledge" | "updateState" | "trackAdd" | "next" | "trackUpdate" | "timeUpdate" | "trackRemove" | "listenersUpdate" | "attributesChange" | "clearQueue" | "error"
	>([
		[opcodes.ACKNOWLEDGE, "acknowledge"],
		[opcodes.STATE, "updateState"],
		[opcodes.TRACK_ADD, "trackAdd"],
		[opcodes.NEXT, "next"],
		[opcodes.TRACK_UPDATE, "trackUpdate"],
		[opcodes.TIME_UPDATE, "timeUpdate"],
		[opcodes.TRACK_REMOVE, "trackRemove"],
		[opcodes.LISTENERS_UPDATE, "listenersUpdate"],
		[opcodes.ATTRIBUTES_CHANGE, "attributesChange"],
		[opcodes.CLEAR_QUEUE, "clearQueue"],
		[opcodes.ERROR, "error"]
	])

	public constructor() {
		globalThis.addEventListener("online", () => {
			// No point waiting out the backoff if the browser knows connectivity just came back
			if (this.connectionState === "reconnecting" && this.reconnectTimer) {
				clearTimeout(this.reconnectTimer)
				this.reconnectTimer = null
				this.connect()
			}
		})
	}

	public connect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}

		const origin = globalThis.location.origin.replace("http", "ws")
		this.ws = new WebSocket(`${origin}/public`)

		this.ws.addEventListener("open", () => this.onOpen())
		this.ws.addEventListener("close", event => this.onClose(event))
		this.ws.addEventListener("error", console.error)
		this.ws.addEventListener("message", event => {
			console.log("%c[WS ←]", "color: blue", event.data)
			const data = JSON.parse(event.data)
			const method = this.opcodeMethodMap.get(data.op)
			if (method) this[method](data)
		})

		this.player.render()
	}

	public send(data: any, revert?: () => void): void {
		if (!data.nonce) data.nonce = generateNonce()

		if (this.ws?.readyState !== WebSocket.OPEN) {
			revert?.()
			return
		}

		if (revert) {
			const nonce = data.nonce as number
			this.pendingActions.set(nonce, revert)
			// Success is signaled through the normal state broadcasts, so just stop tracking after a while
			setTimeout(() => this.pendingActions.delete(nonce), 10000)
		}

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
		this.ws = null
		this.sideControls.mainLoaded = false
		this.sideControls.render()
		document.body.classList.add("disconnected")

		if (this.connectionState === "dead") return

		this.connectionState = "reconnecting"
		this.player.render()

		const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts) + Math.random() * 500
		this.reconnectAttempts++
		this.reconnectTimer = setTimeout(() => this.connect(), delay)
	}

	public error(data: { nonce?: number | null; d?: { code?: string } }): void {
		if (typeof data.nonce === "number") {
			const revert = this.pendingActions.get(data.nonce)
			if (revert) {
				this.pendingActions.delete(data.nonce)
				revert()
			}
		}

		switch (data.d?.code) {
		case "NOT_LISTENING":
			toast("You need to be listening in the voice channel to do that.")
			break

		case "AUTH_FAILED":
			this.die("Your login is invalid or expired. Log in again, then refresh the page.")
			break

		case "NO_VOICE_STATE":
			this.die("Amanda can't see you in a voice channel. Join one, then refresh the page.")
			break

		case "UNAVAILABLE":
			this.die("The dashboard is temporarily unavailable. Try again later.")
			break

		default: break
		}
	}

	private die(reason: string): void {
		this.connectionState = "dead"
		this.deadReason = reason
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		this.player.render()
	}

	public statusText(): string {
		switch (this.connectionState) {
		case "connecting": return "Connecting..."
		case "reconnecting": return "Reconnecting..."
		case "dead": return this.deadReason || "Disconnected. Refresh the page."
		default: return "Nothing playing"
		}
	}

	public acknowledge(data: { d: { serverTimeDiff: number } }): void {
		if (!data.d) return
		serverTimeDiff = data.d.serverTimeDiff
		this.connectionState = "connected"
		this.reconnectAttempts = 0
		document.body.classList.remove("disconnected")
		console.log("Time difference: " + serverTimeDiff)
		this.sideControls.mainLoaded = true
		this.sideControls.render()
		this.player.render()
	}

	public updateState(data: { d: WebQueueJSON }): void {
		const oldState = this.state
		this.state = data.d || null
		if (this.state === null) {
			q("#voice-channel-name")!.textContent = "Nothing playing"
			this.player.setTrack(null)
			this.player.updateAttributes({ loop: false })
			this.resetTime()
			this.queue.replaceItems([])
			this.listenManager.stop().catch(console.error)
		} else {
			q("#voice-channel-name")!.textContent = this.state.voiceChannel.name
			this.player.setTrack(this.state.tracks[0])
			this.player.updateAttributes(this.state.attributes)
			this.queue.replaceItems(this.state.tracks.slice(1))
			this.queue.isFirstAdd = false
			this.updatePlayerTime()
			if (oldState === null && this.state.tracks[0]) {
				this.listenManager.next(this.state.tracks[0]).catch(console.error)
			}
		}
		this.sideControls.render()
		this.listenersUpdate(data)
	}

	public listenersUpdate(data: { d: WebQueueJSON }): void {
		if (data && this.state) {
			this.state.members = data.d.members
			this.voiceInfo.setMembers(this.state.members)
		} else {
			this.voiceInfo.setMembers([])
		}
	}

	public trackAdd(data: { d: { position: number; track: WebTrackJSON } }): void {
		if (!this.state) return
		this.state.tracks.splice(data.d.position, 0, data.d.track)
		if (this.state.tracks.length === 1) {
			this.player.setTrack(data.d.track)
			this.updatePlayerTime()
			this.listenManager.next(data.d.track).catch(console.error)
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
		this.listenManager.next(this.state.tracks[0]).catch(console.error)
	}

	public trackUpdate(data: { d: { index: number; track: WebTrackJSON } }): void {
		if (!this.state) return
		const track = data.d.track
		const index = data.d.index
		if (!this.state.tracks[index]) return
		Object.assign(this.state.tracks[index], track)
		if (index === 0) this.player.updateData(track)
		else this.queue.children[index - 1]?.updateData(track)
	}

	public timeUpdate(data: { d: { playing: boolean } }): void {
		if (!this.state) return
		if (data.d.playing && !this.state.playing) this.listenManager.resume().catch(console.error)
		else if (!data.d.playing && this.state.playing) this.listenManager.pause().catch(console.error)
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

	public rewind(): void {
		this.send({
			op: opcodes.SEEK,
			d: { time: 0 }
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

	public stop(): void {
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

window.session = new Session()
window.session.connect()
