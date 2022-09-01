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

/**
 * @template T
 * @typedef {Object} Packet
 * @property {number} [nonce]
 * @property {typeof opcodes[keyof typeof opcodes]} op
 * @property {T} [d]
 */

class Session {
	/** @param {WebSocket} webs */
	constructor(webs) {
		/** @type {WebSocket} */
		this.ws = webs
		/** @type {import("../../source/types").WebQueue | null} */
		this.state = null

		this.player = new Player(q("#player-container"), this)
		this.queue = new Queue(q("#queue-container"), this)
		this.voiceInfo = new VoiceInfo(q("#voice-info"))
		this.sideControls = new SideControls(q("#side-controls"), this)
		this.listenManager = new ListenManager()

		/** @type {Map<number, "acknowledge" | "updateState" | "trackAdd" | "next" | "trackUpdate" | "timeUpdate" | "trackRemove" | "listenersUpdate" | "attributesChange" | "clearQueue">} */
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

	/** @param {Packet<unknown>} data */
	send(data) {
		if (!data.nonce) data.nonce = generateNonce()
		let message = JSON.stringify(data)
		console.log("%c[WS →]", "color: #c00000", message)
		this.ws.send(message)
	}

	onOpen() {
		this.send({op: opcodes.IDENTIFY, d: {cookie: document.cookie, channel_id: channelID, timestamp: Date.now()}})
	}

	/** @param {CloseEvent} event */
	onClose(event) {
		console.log("WebSocket closed.", event)
	}

	/** @param {Packet<{ serverTimeDiff: number }>} data */
	acknowledge(data) {
		if (!data.d) return
		serverTimeDiff = data.d.serverTimeDiff
		console.log("Time difference: "+serverTimeDiff)
		this.sideControls.mainLoaded = true
		this.sideControls.render()
	}

	/** @param {Packet<import("../../source/types").WebQueue>} data */
	updateState(data) {
		let oldState = this.state
		this.state = data.d || null
		if (this.state === null) {
			q("#voice-channel-name").textContent = "Nothing playing"
			this.player.setSong(null)
			this.player.updateAttributes({})
			this.resetTime()
			this.queue.replaceItems([])
			this.listenManager.stop()
		} else {
			q("#voice-channel-name").textContent = this.state.voiceChannel.name
			this.player.setSong(this.state.songs[0])
			this.player.updateAttributes(this.state.attributes)
			this.queue.replaceItems(this.state.songs.slice(1))
			this.queue.isFirstAdd = false
			this.updatePlayerTime()
			if (oldState === null && this.state.songs[0]) {
				this.listenManager.next(this.state.songs[0])
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
		this.state.songs.splice(data.d.position, 0, data.d.song)
		if (this.state.songs.length == 1) {
			this.player.setSong(data.d.song)
			this.updatePlayerTime()
			this.listenManager.next(data.d.song)
		} else this.queue.addItem(data.d.song, data.d.position)
	}

	trackRemove(data) {
		if (!this.state) return
		let index = data.d.index
		this.queue.removeIndex(index-1) // -1 because frontend does not hold current song but backend does
		this.state.songs.splice(index, 1) // same reason
	}

	clearQueue() {
		if (!this.state) return
		this.queue.removeAllSongs()
		this.state.songs.splice(1)
	}

	next() {
		if (!this.state) return
		this.state.songs.shift()
		this.queue.shift()
		this.resetTime()
		this.player.setSong(this.state.songs[0] || null)
		this.listenManager.next(this.state.songs[0])
	}

	trackUpdate(data) {
		if (!this.state) return
		let song = data.d.song
		let index = data.d.index
		Object.assign(this.state.songs[index], song)
		if (index == 0) this.player.updateData(data)
		else this.queue.children[index-1].updateData(song)
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
			Object.assign(this.state, {songStartTime: 0, maxTime: 0, playing: false})
			this.updatePlayerTime()
		}
	}

	updatePlayerTime() {
		if (!this.state) return
		this.player.updateTime({
			playing: this.state.playing,
			songStartTime: this.state.songStartTime,
			pausedAt: this.state.pausedAt,
			maxTime: (this.state.songs && this.state.songs[0]) ? this.state.songs[0].length : 0,
			live: (this.state.songs && this.state.songs[0]) ? this.state.songs[0].live : false
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
