// @ts-check

// From HTML
// @ts-ignore
const guildID = _guildID
// @ts-ignore
let serverTimeDiff = _serverTimeDiff

import {Player, Queue, VoiceInfo, SideControls} from "./classes.js"
import {q, opcodes, generateNonce} from "./utilities.js"
import {ListenManager} from "./wrappers/ListenManager.js"

class Session {
	constructor(ws) {
		this.ws = ws
		this.state = null

		this.player = new Player(q("#player-container"), this)
		this.queue = new Queue(q("#queue-container"), this)
		this.voiceInfo = new VoiceInfo(q("#voice-info"))
		this.sideControls = new SideControls(q("#side-controls"), this)
		this.listenManager = new ListenManager()

		const opcodeMethodMap = new Map([
			[opcodes.ACKNOWLEDGE, "acknowledge"],
			[opcodes.STATE, "updateState"],
			[opcodes.QUEUE_ADD, "queueAdd"],
			[opcodes.NEXT, "next"],
			[opcodes.SONG_UPDATE, "songUpdate"],
			[opcodes.TIME_UPDATE, "timeUpdate"],
			[opcodes.REMOVE_SONG, "removeSong"],
			[opcodes.MEMBERS_CHANGE, "membersChange"],
			[opcodes.ATTRIBUTES_CHANGE, "attributesChange"],
			[opcodes.REMOVE_ALL_SONGS, "removeAllSongs"]
		])

		this.ws.addEventListener("open", () => this.onOpen())
		this.ws.addEventListener("close", event => this.onClose(event))
		this.ws.addEventListener("error", console.error)
		this.ws.addEventListener("message", event => {
			console.log("%c[WS ←]", "color: blue", event.data)
			let data = JSON.parse(event.data)
			this[opcodeMethodMap.get(data.op)](data)
		})
	}

	send(data) {
		if (!data.nonce) data.nonce = generateNonce()
		let message = JSON.stringify(data)
		console.log("%c[WS →]", "color: #c00000", message)
		this.ws.send(message)
	}

	onOpen() {
		this.send({op: opcodes.IDENTIFY, d: {cookie: document.cookie, guildID, timestamp: Date.now()}})
	}

	onClose(event) {
		console.log("WebSocket closed.", event)
	}

	acknowledge(data) {
		serverTimeDiff = data.d.serverTimeDiff
		console.log("Time difference: "+serverTimeDiff)
		this.sideControls.mainLoaded = true
		this.sideControls.render()
	}

	updateState(data) {
		let oldState = this.state
		this.state = data.d
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
		this.membersChange(data)
	}

	membersChange(data) {
		if (data && this.state) {
			this.state.members = data.d.members
			this.voiceInfo.setMembers(this.state.members)
		} else {
			this.voiceInfo.setMembers([])
		}
	}

	queueAdd(data) {
		let song = data.d.song
		let position = data.d.position
		if (position == -1) {
			this.state.songs.push(song)
		} else {
			this.state.songs.splice(position, 0, song)
		}
		if (position > 0) position--
		if (this.state.songs.length == 1) {
			this.player.setSong(song)
			this.updatePlayerTime()
			this.listenManager.next(song)
		} else {
			this.queue.addItem(song, position)
		}
	}

	removeSong(data) {
		let index = data.d.index
		this.queue.removeIndex(index-1) // -1 because frontend does not hold current song but backend does
		this.state.songs.splice(index, 1) // same reason
	}

	removeAllSongs() {
		this.queue.removeAllSongs()
		this.state.songs.splice(1)
	}

	next() {
		this.state.songs.shift()
		this.queue.shift()
		this.resetTime()
		this.player.setSong(this.state.songs[0] || null)
		this.listenManager.next(this.state.songs[0])
	}

	songUpdate(data) {
		let song = data.d.song
		let index = data.d.index
		Object.assign(this.state.songs[index], song)
		if (index == 0) this.player.updateData(data)
		else this.queue.children[index-1].updateData(song)
	}

	timeUpdate(data) {
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
		this.player.updateTime({
			playing: this.state.playing,
			songStartTime: this.state.songStartTime,
			pausedAt: this.state.pausedAt,
			maxTime: (this.state.songs && this.state.songs[0]) ? this.state.songs[0].length : 0,
			live: (this.state.songs && this.state.songs[0]) ? this.state.songs[0].live : false
		})
	}

	playpause() {
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
		Object.assign(this.state.attributes, data.d)
		this.player.updateAttributes(this.state.attributes)
	}

	requestAttributesChange(data) {
		this.send({
			op: opcodes.REQUEST_ATTRIBUTES_CHANGE,
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

export {
	Session
}
