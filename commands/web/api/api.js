require("../../../types.js")

const Discord = require("discord.js")

const opcodes = {
	"IDENTIFY": 1,
	"ACKNOWLEDGE": 2,
	"REQUEST_STATE": 3,
	"STATE": 4,
	"QUEUE_ADD": 5,
	"NEXT": 6,
	"SONG_UPDATE": 7,
	"TIME_UPDATE": 8,
	"TOGGLE_PLAYBACK": 9,
	"SKIP": 10,
	"STOP": 11,
	"QUEUE_REMOVE": 12,
	"REQUEST_QUEUE_REMOVE": 13
}

const opcodeMethodMap = new Map([
	[opcodes.IDENTIFY, "identify"],
	[opcodes.REQUEST_STATE, "sendState"],
	[opcodes.TOGGLE_PLAYBACK, "togglePlayback"],
	[opcodes.SKIP, "skip"],
	[opcodes.STOP, "stop"],
	[opcodes.REQUEST_QUEUE_REMOVE, "requestQueueRemove"]
])

const eventList = [
	["queue", "queueAdd", "queueAdd"],
	["manager", "new", "playerReplace"],
	["queue", "next", "next"],
	["queue", "songUpdate", "songUpdate"],
	["queue", "dissolve", "queueDissolve"],
	["queue", "timeUpdate", "timeUpdate"],
	["queue", "queueRemove", "queueRemove"]
]

/** @param {PassthroughType} passthrough */
module.exports = (passthrough) => {
	const {client, extra,  reloader, queueManager} = passthrough;

	let utils = require("../../../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let validators = require("../../../modules/validator.js")()
	reloader.useSync("./modules/validator.js", validators)

	class Session {
		constructor(ws) {
			this.ws = ws
			this.member = null
			this.eventStore = new Map()
	
			this.ws.on("message", async message => {
				let data = JSON.parse(message)
				let method = opcodeMethodMap.get(data.op)
				if (method) {
					this[method](data)
				}
			})
	
			ws.on("close", () => this.onClose())
	
			ws.on("error", e => console.log("WebSocket error", e))
		}
	
		send(data) {
			this.ws.send(JSON.stringify(data))
		}

		getQueue() {
			return this.member ? this.member.guild.queue : null
		}

		onClose() {
			if (this.member) console.log("WebSocket disconnected: "+this.member.user.tag)
			this.removeEventListeners()
		}

		addEventListeners() {
			this.removeEventListeners()
			
			eventList.forEach(([emitter, eventName, fnName]) => {
				let fn = this[fnName].bind(this)
				if (emitter == "queue") {
					if (this.getQueue()) {
						this.eventStore.set(fnName, [this.getQueue().events, fn])
						this.getQueue().events.on(eventName, fn)
					}
				} else if (emitter == "manager") {
					this.eventStore.set(fnName, [queueManager.events, fn])
					queueManager.events.on(eventName, fn)
				}
			})
		}

		removeEventListeners() {
			this.eventStore.forEach(([emitter, fn], eventName) => {
				emitter.removeListener(eventName, fn)
			})
			this.eventStore.clear()
		}
	
		async identify(data) {
			if (data.d && typeof(data.d.cookie) == "string" && typeof(data.d.guildID) == "string") {
				let cookies = extra.getCookies({headers: {cookie: data.d.cookie}})
				let session = await extra.getSession(cookies)
				if (!session) return
				let user = client.users.get(session.userID)
				let guild = client.guilds.get(data.d.guildID)
				if (!user || !guild) return
				let member = guild.members.get(user.id)
				if (!member) return
				this.member = member
				this.addEventListeners()
				console.log("WebSocket identified: "+this.member.user.tag)
				this.send({
					op: opcodes.ACKNOWLEDGE,
					nonce: data.nonce || null,
				})
			}
		}
	
		sendState(data) {
			if (!this.member) return
			let state = this.member.guild.queue ? this.member.guild.queue.wrapper.getState() : null
			this.send({
				op: opcodes.STATE,
				nonce: data.nonce || null,
				d: state
			})
		}

		playerReplace(queue) {
			if (queue.id == this.member.guild.id) {
				this.sendState({})
				this.addEventListeners()
			}
		}

		queueAdd(song, position) {
			this.send({
				op: opcodes.QUEUE_ADD,
				d: {
					song: song.webInfo(),
					position: position
				}
			})
		}

		queueRemove(position) {
			this.send({
				op: opcodes.QUEUE_REMOVE,
				d: {
					position: position
				}
			})
		}

		next() {
			this.send({
				op: opcodes.NEXT,
			})
		}

		songUpdate(index) {
			let song = this.getQueue().songs[index]
			this.send({
				op: opcodes.SONG_UPDATE,
				d: {
					index: index,
					song: song.webInfo()
				}
			})
		}

		queueDissolve() {
			this.send({
				op: opcodes.STATE,
				d: null
			})
		}

		timeUpdate() {
			let queue = this.getQueue()
			let data = {
				playing: queue.playing,
				time: queue.dispatcher ? queue.dispatcher.time : 0
			}
			this.send({
				op: opcodes.TIME_UPDATE,
				d: data
			})
		}

		togglePlayback() {
			let queue = this.getQueue()
			if (queue) queue.wrapper.togglePlaying()
		}

		skip() {
			let queue = this.getQueue()
			if (queue) queue.wrapper.skip()
		}

		stop() {
			let queue = this.getQueue()
			if (queue) queue.wrapper.stop()
		}

		requestQueueRemove(data) {
			if (data.d && typeof(data.d.index) == "number" && !isNaN(data.d.index)) {
				let queue = this.getQueue()
				if (queue) queue.removeSong(data.d.index)
			}
		}
	}

	setImmediate(() => {
		const wss = passthrough.wss
		wss.on("connection", ws => {
			new Session(ws)
		})
	})

	return []
}
