/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/ban-ts-comment */

// From HTML
// @ts-ignore
const channelID = _channelID
// @ts-ignore
let serverTimeDiff = _serverTimeDiff

import { Player, Queue, VoiceInfo, SideControls } from "./classes.js"
import { q, opcodes, generateNonce } from "./utilities.js"
import { ListenManager } from "./wrappers/ListenManager.js"

class Session {
	constructor(webs) {
		this.ws = webs
		this.state = null

		this.player = new Player(q("#player-container"), this)
		this.queue = new Queue(q("#queue-container"), this)
		this.voiceInfo = new VoiceInfo(q("#voice-info"))
		this.sideControls = new SideControls(q("#side-controls"), this)
		this.listenManager = new ListenManager()

		const opcodeMethodMap = new Map([
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
	send(data) {
		if (!data.nonce) data.nonce = generateNonce()
		let message = JSON.stringify(data)
		console.log("%c[WS →]", "color: #c00000", message)
		this.ws.send(message)
	}
	onOpen() {
		this.send({op: opcodes.IDENTIFY, d: {cookie: document.cookie, channel_id: channelID, timestamp: Date.now()}})
	}
	onClose(event) {
		console.log("WebSocket closed.", event)
	}
	acknowledge(data) {
		if (!data.d) return
		serverTimeDiff = data.d.serverTimeDiff
		console.log("Time difference: "+serverTimeDiff)
		this.sideControls.mainLoaded = true
		this.sideControls.render()
	}
	updateState(data) {
		let oldState = this.state
		this.state = data.d || null
		if (this.state === null) {
			q("#voice-channel-name").textContent = "Nothing playing"
			this.player.setTrack(null)
			this.player.updateAttributes({})
			this.resetTime()
			this.queue.replaceItems([])
			this.listenManager.stop()
		} else {
			q("#voice-channel-name").textContent = this.state.voiceChannel.name
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
	listenersUpdate(data) {
		if (data && this.state) {
			this.state.members = data.d.members
			this.voiceInfo.setMembers(this.state.members)
		} else {
			this.voiceInfo.setMembers([])
		}
	}
	trackAdd(data) {
		if (!this.state) return
		this.state.tracks.splice(data.d.position, 0, data.d.track)
		if (this.state.tracks.length == 1) {
			this.player.setTrack(data.d.track)
			this.updatePlayerTime()
			this.listenManager.next(data.d.track)
		} else this.queue.addItem(data.d.track, data.d.position)
	}
	trackRemove(data) {
		if (!this.state) return
		let index = data.d.index
		this.queue.removeIndex(index-1) // -1 because frontend does not hold current track but backend does
		this.state.tracks.splice(index, 1) // same reason
	}
	clearQueue() {
		if (!this.state) return
		this.queue.removeAllTracks()
		this.state.tracks.splice(1)
	}
	next() {
		if (!this.state) return
		this.state.tracks.shift()
		this.queue.shift()
		this.resetTime()
		this.player.setTrack(this.state.tracks[0] || null)
		this.listenManager.next(this.state.tracks[0])
	}
	trackUpdate(data) {
		if (!this.state) return
		let track = data.d.track
		let index = data.d.index
		Object.assign(this.state.tracks[index], track)
		if (index == 0) this.player.updateData(data)
		else this.queue.children[index-1].updateData(track)
	}
	timeUpdate(data) {
		if (!this.state) return
		if (data.d.playing && !this.state.playing) this.listenManager.resume()
		else if (!data.d.playing && this.state.playing) this.listenManager.pause()
		Object.assign(this.state, data.d)
		this.updatePlayerTime()
	}
	resetTime() {
		if (this.state) {
			Object.assign(this.state, {trackStartTime: 0, maxTime: 0, playing: false})
			this.updatePlayerTime()
		}
	}
	updatePlayerTime() {
		if (!this.state) return
		this.player.updateTime({
			playing: this.state.playing,
			trackStartTime: this.state.trackStartTime,
			pausedAt: this.state.pausedAt,
			maxTime: (this.state.tracks && this.state.tracks[0]) ? this.state.tracks[0].length : 0,
			live: (this.state.tracks && this.state.tracks[0]) ? this.state.tracks[0].live : false
		})
	}
	togglePlayback() {
		this.send({
			op: opcodes.TOGGLE_PLAYBACK
		})
	}
	skip() {
		this.send({
			op: opcodes.SKIP
		})
	}
	stop() {
		this.send({
			op: opcodes.STOP
		})
	}
	attributesChange(data) {
		if (!this.state) return
		Object.assign(this.state.attributes, data.d)
		this.player.updateAttributes(this.state.attributes)
	}
	requestAttributesChange(data) {
		this.send({
			op: opcodes.ATTRIBUTES_CHANGE,
			d: data
		})
	}
}

let ws = (function() {
	const origin = window.location.origin.replace("http", "ws")
	return new WebSocket(origin)
})()

// @ts-ignore
window.session = new Session(ws)

export { Session }
