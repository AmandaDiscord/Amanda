//@ts-check

const passthrough = require("../passthrough")

const utils = require("../modules/utilities")

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
	"REQUEST_QUEUE_REMOVE": 13,
	"MEMBERS_CHANGE": 14,
	"ATTRIBUTES_CHANGE": 15,
	"REQUEST_ATTRIBUTES_CHANGE": 16
}

const opcodeMethodMap = new Map([
	[opcodes.IDENTIFY, "identify"],
	[opcodes.REQUEST_STATE, "sendState"],
	[opcodes.TOGGLE_PLAYBACK, "togglePlayback"],
	[opcodes.SKIP, "skip"],
	[opcodes.STOP, "stop"],
	[opcodes.REQUEST_QUEUE_REMOVE, "requestQueueRemove"],
	[opcodes.REQUEST_ATTRIBUTES_CHANGE, "requestAttributesChange"]
])

const eventList = [
	["queue", "queueAdd", "queueAdd"],
	["manager", "new", "playerReplace"],
	["queue", "next", "next"],
	["queue", "songUpdate", "songUpdate"],
	["queue", "dissolve", "queueDissolve"],
	["queue", "timeUpdate", "timeUpdate"],
	["queue", "queueRemove", "queueRemove"],
	["queue", "membersChange", "membersChange"],
	["queue", "attributes", "attributesChange"]
]

const {ipc, snow} = passthrough;

/** @type {Session[]} */
const sessions = []
const states = new Map()

function getState(guildID) {
	if (states.has(guildID)) return states.get(guildID).get()
	const state = new utils.UpdatingValueCache(() => ipc.router.requestState(guildID))
	states.set(guildID, state)
	return state.get()
}

function replaceState(guildID, data) {
	if (states.has(guildID)) return states.get(guildID).update(() => data)
	const state = new utils.UpdatingValueCache(() => Promise.resolve(data))
	states.set(guildID, state)
}

ipc.addReceivers([
	{
		op: "NEW_QUEUE",
		fn: ({guildID, state}) => {
			//if (state && state.songs) console.log(`Queue replaced. It has ${state.songs.length} songs.`)
			replaceState(guildID, state)
			sessions.forEach(session => {
				if (session.guild && session.guild.id == guildID) {
					session.sendState({})
				}
			})
		}
	},
	{
		op: "ADD_SONG",
		fn: ({guildID, position, song}) => {
			const state = states.get(guildID)
			if (!state) return // queue isn't cached yet, so no need to update it
			state.update(cache => {
				if (position == -1) {
					cache.songs.push(song)
				} else {
					cache.songs.splice(position, 0, song)
				}
				//console.log(cache)
				//console.log(`Song added. There are now ${cache.songs.length} songs.`)
				return cache
			})
			sessions.forEach(session => {
				if (session.guild && session.guild.id == guildID) {
					session.queueAdd(song, position)
				}
			})
		}
	},
	{
		op: "TIME_UPDATE",
		fn: ({guildID, songStartTime, playing}) => {
			const state = states.get(guildID)
			if (!state) return // queue isn't cached yet, so no need to update it
			state.update(cache => {
				cache.songStartTime = songStartTime
				cache.playing = playing
				return cache
			})
			sessions.forEach(session => {
				if (session.guild && session.guild.id == guildID) {
					session.timeUpdate({songStartTime, playing})
				}
			})
		}
	},
	{
		op: "NEXT_SONG",
		fn: ({guildID}) => {
			const state = states.get(guildID)
			if (!state) return // queue isn't cached yet, so no need to update it
			state.update(cache => {
				cache.songs.shift()
				return cache
			})
			sessions.forEach(session => {
				if (session.guild && session.guild.id == guildID) {
					session.next()
				}
			})
		}
	}
])


class Session {
	constructor(ws) {
		this.ws = ws
		this.loggedin = false
		this.guild = null
		this.user = null

		this.ws.on("message", async message => {
			try {
				let data = JSON.parse(message)
				let method = opcodeMethodMap.get(data.op)
				if (method) {
					this[method](data)
				}
			} catch (e) {}
		})

		ws.on("close", () => this.onClose())

		ws.on("error", e => console.log("WebSocket error", e))

		sessions.push(this)
	}

	send(data) {
		this.ws.send(JSON.stringify(data))
	}

	onClose() {
		if (this.user) console.log("WebSocket disconnected: "+this.user.username)
		const index = sessions.indexOf(this)
		sessions.splice(index, 1)
	}

	async identify(data) {
		if (data && data.d && typeof(data.d.cookie) == "string" && typeof(data.d.guildID) == "string") {
			// Check the user and guild are legit
			let cookies = utils.getCookies({headers: {cookie: data.d.cookie}})
			let session = await utils.getSession(cookies)
			if (!session) return
			const guild = await ipc.router.requestGuildForUser(session.userID, data.d.guildID)
			if (!guild) return
			const user = await snow.user.cache.fetchUser(session.userID)
			if (!user) return
			// User and guild are legit
			// We don't assign these variable earlier to defend against multiple identifies
			this.loggedin = true
			this.guild = guild
			this.user = user
			console.log("WebSocket identified: "+this.user.username)
			this.send({
				op: opcodes.ACKNOWLEDGE,
				nonce: data.nonce || null,
			})
			this.sendState({})
		}
	}

	async sendState(data) {
		if (!this.loggedin) return
		const state = await getState(this.guild.id)
		this.send({
			op: opcodes.STATE,
			nonce: data.nonce || null,
			d: state
		})
	}

	queueAdd(song, position) {
		this.send({
			op: opcodes.QUEUE_ADD,
			d: {
				song: song,
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
		/*let song = this.getQueue().songs[index]
		this.send({
			op: opcodes.SONG_UPDATE,
			d: {
				index: index,
				song: song.webInfo()
			}
		})*/
	}

	membersChange() {
		/*let queue = this.getQueue()
		if (queue) {
			this.send({
				op: opcodes.MEMBERS_CHANGE,
				d: {
					members: queue.wrapper.getMembers()
				}
			})
		}*/
	}

	queueDissolve() {
		/*this.send({
			op: opcodes.STATE,
			d: null
		})*/
	}

	timeUpdate(data) {
		this.send({
			op: opcodes.TIME_UPDATE,
			d: data
		})
	}

	togglePlayback() {
		/*let queue = this.getQueue()
		if (queue) queue.wrapper.togglePlaying()*/
	}

	skip() {
		/*let queue = this.getQueue()
		if (queue) queue.wrapper.skip()*/
	}

	stop() {
		/*let queue = this.getQueue()
		if (queue) queue.wrapper.stop()*/
	}

	requestQueueRemove(data) {
		/*if (data && data.d && typeof(data.d.index) == "number" && !isNaN(data.d.index)) {
			let queue = this.getQueue()
			if (queue) queue.removeSong(data.d.index)
		}*/
	}

	attributesChange() {
		/*this.send({
			op: opcodes.ATTRIBUTES_CHANGE,
			d: this.getQueue().wrapper.getAttributes()
		})*/
	}

	requestAttributesChange(data) {
		/*let queue = this.getQueue()
		if (queue) {
			if (typeof(data) == "object" && typeof(data.d) == "object") {
				if (typeof(data.d.auto) == "boolean" && queue.auto != data.d.auto) queue.wrapper.toggleAuto()
			}
		}*/
	}
}

const wss = passthrough.wss
wss.on("connection", ws => {
	new Session(ws)
})

module.exports = []
