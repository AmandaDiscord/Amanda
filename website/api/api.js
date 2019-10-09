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
	"REMOVE_SONG": 12,
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
	},
	{
		op: "SONG_UPDATE",
		fn: ({guildID, song, index}) => {
			const state = states.get(guildID)
			if (!state) return // queue isn't cached yet, so no need to update it
			state.update(cache => {
				cache.songs[index] = song
				return cache
			})
			sessions.forEach(session => {
				if (session.guild && session.guild.id == guildID) {
					session.songUpdate(song, index)
				}
			})
		}
	},
	{
		op: "REMOVE_SONG",
		fn: ({guildID, index}) => {
			const state = states.get(guildID)
			if (!state) return // queue isn't cached yet, so no need to update it
			state.update(cache => {
				cache.songs.splice(index, 1)
				return cache
			})
			sessions.forEach(session => {
				if (session.guild && session.guild.id == guildID) {
					session.removeSong(index)
				}
			})
		}
	},
	{
		op: "MEMBERS_UPDATE",
		fn: ({guildID, members}) => {
			const state = states.get(guildID)
			if (!state) return // queue isn't cached yet, so no need to update it
			state.update(cache => {
				cache.members = members
				return cache
			})
			sessions.forEach(session => {
				if (session.guild && session.guild.id == guildID) {
					session.membersChange(members)
				}
			})
		}
	},
	{
		op: "ATTRIBUTES_CHANGE",
		fn: ({guildID, attributes}) => {
			const state = states.get(guildID)
			if (!state) return // queue isn't cached yet, so no need to update it
			state.update(cache => {
				cache.attributes = attributes
				return cache
			})
			sessions.forEach(session => {
				if (session.guild && session.guild.id == guildID) {
					session.attributesChange(attributes)
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
		if (data && data.d && typeof data.d.cookie === "string" && typeof data.d.guildID === "string" && typeof data.d.timestamp === "number") {
			const serverTimeDiff = Date.now()-data.d.timestamp
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
				d: {
					serverTimeDiff: serverTimeDiff
				}
			})
			this.sendState({})
		}
	}

	async sendState(data) {
		if (!this.loggedin) return
		const state = await getState(this.guild.id)
		let nonce = null
		if (data && typeof data.nonce === "number") nonce = data.nonce
		this.send({
			op: opcodes.STATE,
			nonce: nonce,
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

	removeSong(index) {
		this.send({
			op: opcodes.REMOVE_SONG,
			d: {
				index: index
			}
		})
	}

	next() {
		this.send({
			op: opcodes.NEXT,
		})
	}

	songUpdate(song, index) {
		this.send({
			op: opcodes.SONG_UPDATE,
			d: {
				song: song,
				index: index
			}
		})
	}

	membersChange(members) {
		this.send({
			op: opcodes.MEMBERS_CHANGE,
			d: {
				members: members
			}
		})
	}

	timeUpdate(data) {
		this.send({
			op: opcodes.TIME_UPDATE,
			d: data
		})
	}

	togglePlayback() {
		if (!this.loggedin) return
		ipc.router.requestTogglePlayback(this.guild.id)
	}

	skip() {
		if (!this.loggedin) return
		ipc.router.requestSkip(this.guild.id)
	}

	stop() {
		if (!this.loggedin) return
		ipc.router.requestStop(this.guild.id)
	}

	requestQueueRemove(data) {
		if (!this.loggedin) return
		if (data && data.d && typeof data.d.index === "number") {
			ipc.router.requestQueueRemove(this.guild.id, data.d.index)
		}
	}

	attributesChange(attributes) {
		this.send({
			op: opcodes.ATTRIBUTES_CHANGE,
			d: attributes
		})
	}

	requestAttributesChange(data) {
		if (!this.loggedin) return
		if (typeof(data) == "object" && typeof(data.d) == "object") {
			if (typeof(data.d.auto) == "boolean") ipc.router.requestToggleAuto(this.guild.id)
		}
	}
}

const wss = passthrough.wss
wss.on("connection", ws => {
	new Session(ws)
})

module.exports = []
