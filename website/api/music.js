// @ts-check

const passthrough = require("../passthrough")
const { sync } = passthrough

/** @type {import("../modules/utilities")} */
const utils = sync.require("../modules/utilities")

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
	"REQUEST_ATTRIBUTES_CHANGE": 16,
	"REQUEST_CLEAR_QUEUE": 17,
	"REMOVE_ALL_SONGS": 18,
	"SONG_TIME_UPDATE": 19
}

const opcodeMethodMap = new Map([
	[opcodes.IDENTIFY, "identify"],
	[opcodes.REQUEST_STATE, "sendState"],
	[opcodes.TOGGLE_PLAYBACK, "togglePlayback"],
	[opcodes.SKIP, "skip"],
	[opcodes.STOP, "stop"],
	[opcodes.REQUEST_QUEUE_REMOVE, "requestQueueRemove"],
	[opcodes.REQUEST_ATTRIBUTES_CHANGE, "requestAttributesChange"],
	[opcodes.REQUEST_CLEAR_QUEUE, "requestClearQueue"]
])

const { ipc, snow } = passthrough

/** @type {Session[]} */
const sessions = []
/** @type {Map<string, typeof utils.UpdatingValueCache.prototype>} */
const states = new Map()

function getState(guildID) {
	if (states.has(guildID)) return states.get(guildID).get()
	const state = new utils.UpdatingValueCache(() => ipc.replier.requestGetQueueState(guildID))
	states.set(guildID, state)
	return state.get()
}

function replaceState(guildID, data) {
	if (states.has(guildID)) return states.get(guildID).update(() => data)
	const state = new utils.UpdatingValueCache(() => Promise.resolve(data))
	states.set(guildID, state)
}

ipc.server.on("socket.disconnected", disconnectListener)
function disconnectListener() {
	console.log("Socket disconnected, clearing cached state")
	sessions.forEach(session => {
		session.cleanClose()
	})
	states.clear()
}

/**
 * @param {{op: string, updateCallback: (cache: any, clientData: any) => any, sessionCallback: (session: Session, cache: any, clientData: any) => any}[]} processors
 */
function addProcessors(processors) {
	ipc.replier.addReceivers(processors.map(processor =>
		["api_processor_"+processor.op, {
			op: processor.op,
			fn: clientData => {
				const guildID = clientData.guildID
				const state = states.get(guildID)
				if (!state) return // queue isn't cached yet, so no need to update it
				state.update(cache => {
					if (cache == null) {
						console.error(
							`=====\
							\nUh oh! How did we get here?\
							\nop: ${processor.op}\
							\ndata, ${clientData}\
							\nQueue cache: ${cache}`
						)
					} else {
						cache = processor.updateCallback(cache, clientData)
						sessions.forEach(session => {
							if (session.guild && session.guild.id == guildID) processor.sessionCallback(session, cache, clientData)
						})
					}
					return cache
				})
			}
		}]
	))
}

ipc.replier.addReceivers([
	["NEW_QUEUE", {
		op: "NEW_QUEUE",
		fn: ({ guildID, state }) => {
			// if (state && state.songs) console.log(`Queue replaced. It has ${state.songs.length} songs.`)
			replaceState(guildID, state)
			sessions.forEach(session => {
				if (session.guild && session.guild.id == guildID) session.sendState({})
			})
		}
	}]
])

addProcessors([
	{
		op: "ADD_SONG",
		updateCallback: (cache, { position, song }) => {
			if (position == -1) cache.songs.push(song)
			else cache.songs.splice(position, 0, song)
			return cache
		},
		sessionCallback: (session, cache, { position, song }) => {
			session.queueAdd(song, position)
		}
	},
	{
		op: "TIME_UPDATE",
		updateCallback: (cache, { songStartTime, pausedAt, playing }) => {
			cache.songStartTime = songStartTime
			cache.pausedAt = pausedAt
			cache.playing = playing
			return cache
		},
		sessionCallback: (session, cache, { songStartTime, pausedAt, playing }) => {
			session.timeUpdate({ songStartTime, pausedAt, playing })
		}
	},
	{
		op: "NEXT_SONG",
		updateCallback: (cache, {}) => {
			cache.songs.shift()
			return cache
		},
		sessionCallback: session => {
			session.next()
		}
	},
	{
		op: "SONG_UPDATE",
		updateCallback: (cache, { song, index }) => {
			cache.songs[index] = song
			return cache
		},
		sessionCallback: (session, cache, { song, index }) => {
			session.songUpdate(song, index)
		}
	},
	{
		op: "REMOVE_SONG",
		updateCallback: (cache, { index }) => {
			cache.songs.splice(index, 1)
			return cache
		},
		sessionCallback: (session, cache, { index }) => {
			session.removeSong(index)
		}
	},
	{
		op: "REMOVE_ALL_SONGS",
		updateCallback: cache => {
			cache.songs.splice(1)
			return cache
		},
		sessionCallback: session => {
			session.removeAllSongs()
		}
	},
	{
		op: "MEMBERS_UPDATE",
		updateCallback: (cache, { members }) => {
			cache.members = members
			return cache
		},
		sessionCallback: (session, cache, { members }) => {
			session.membersChange(members)
		}
	},
	{
		op: "ATTRIBUTES_CHANGE",
		updateCallback: (cache, { attributes }) => {
			cache.attributes = attributes
			return cache
		},
		sessionCallback: (session, cache, { attributes }) => {
			session.attributesChange(attributes)
		}
	},
	{
		op: "SONG_TIME_UPDATE",
		updateCallback: (cache, data) => {
			cache.songs[data.index].length = data.lengthSeconds
			return cache
		},
		sessionCallback: (session, cache, data) => {
			session.songTimeUpdate(data.index, data.lengthSeconds)
		}
	}
])

class Session {
	constructor(ws) {
		this.ws = ws
		this.loggedin = false
		this.guild = null
		this.user = null

		this.ws.on("message", message => {
			try {
				const data = JSON.parse(message)
				const method = opcodeMethodMap.get(data.op)
				if (method) this[method](data)
			// eslint-disable-next-line no-empty
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
		if (this.user) console.log(`WebSocket disconnected: ${this.user.username}`)
		const index = sessions.indexOf(this)
		sessions.splice(index, 1)
		console.log(`${sessions.length} sessions in memory`)
	}

	async identify(data) {
		if (data && data.d && typeof data.d.cookie === "string" && typeof data.d.guildID === "string" && typeof data.d.timestamp === "number") {
			const serverTimeDiff = Date.now() - data.d.timestamp
			// Check the user and guild are legit
			const cookies = utils.getCookies({ headers: { cookie: data.d.cookie } })
			const session = await utils.getSession(cookies)
			if (!session) return
			const guild = await ipc.replier.requestGetGuildForUser(session.user_id, data.d.guildID)
			if (!guild) return
			let user = await utils.sql.get("SELECT * FROM users WHERE id = $1", session.user_id)
			if (!user) {
				const tempfailtext = `Fake user tried to identify:\n${require("util").inspect(session)}`
				/** @type {import("@amanda/discordtypings").UserData} */
				const temp = await snow.user.getUser(session.user_id).catch(() => void 0)
				if (!temp) return console.log(tempfailtext)
				user = temp
				await utils.sql.all("INSERT INTO users (id, tag, avatar, bot, added_by) VALUES ($1, $2, $3, $4, $5)", [temp.id, `${temp.username}#${temp.discriminator}`, temp.avatar, temp.bot ? 1 : 0, passthrough.config.cluster_id])
			} else {
				const arr = user.tag.split("#")
				const username = arr.slice(0, arr.length - 1).join("#")
				const discriminator = arr[arr.length - 1]
				user = { username: username, discriminator: discriminator, ...user }
				user.bot = !!user.bot
				delete user.tag
			}
			// User and guild are legit
			// We don't assign these variable earlier to defend against multiple identifies
			this.loggedin = true
			this.guild = guild
			this.user = user
			console.log(`WebSocket identified: ${this.user.username}`)
			console.log(`${sessions.length} sessions in memory`)
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

	cleanClose() {
		this.send({
			op: opcodes.STATE,
			d: null
		})
		this.ws.close()
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

	removeAllSongs() {
		this.send({
			op: opcodes.REMOVE_ALL_SONGS,
			d: null
		})
	}

	next() {
		this.send({
			op: opcodes.NEXT
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

	async allowedToAction() {
		if (!this.loggedin) return false
		const state = await getState(this.guild.id)
		if (!state.members.find(i => i.id === this.user.id)) return false
		return true
	}

	async togglePlayback() {
		const allowed = await this.allowedToAction()
		if (!allowed) return
		ipc.replier.requestTogglePlayback(this.guild.id)
	}

	async skip() {
		const allowed = await this.allowedToAction()
		if (!allowed) return
		ipc.replier.requestSkip(this.guild.id)
	}

	async stop() {
		const allowed = await this.allowedToAction()
		if (!allowed) return
		ipc.replier.requestStop(this.guild.id)
	}

	async requestQueueRemove(data) {
		const allowed = await this.allowedToAction()
		if (!allowed) return

		if (data && data.d && typeof data.d.index === "number") {
			ipc.replier.requestQueueRemove(this.guild.id, data.d.index)
		}
	}

	attributesChange(attributes) {
		this.send({
			op: opcodes.ATTRIBUTES_CHANGE,
			d: attributes
		})
	}

	async requestAttributesChange(data) {
		const allowed = await this.allowedToAction()
		if (!allowed) return
		if (typeof data === "object" && typeof data.d === "object") {
			if (typeof data.d.auto === "boolean") ipc.replier.requestToggleAuto(this.guild.id)
			if (typeof data.d.loop === "boolean") ipc.replier.requestToggleLoop(this.guild.id)
		}
	}

	async requestClearQueue() {
		const allowed = await this.allowedToAction()
		if (!allowed) return
		ipc.replier.requestClearQueue(this.guild.id)
	}

	songTimeUpdate(index, lengthSeconds) {
		this.send({
			op: opcodes.SONG_TIME_UPDATE,
			d: {
				index: index,
				lengthSeconds: lengthSeconds
			}
		})
	}
}

const wss = passthrough.wss
function wsConnection(ws) {
	new Session(ws)
}
wss.on("connection", wsConnection)

console.log("API loaded")

module.exports = [{ cancel: true, code: () => {
	wss.removeListener("connection", wsConnection)
	sessions.forEach(session => {
		session.cleanClose()
	})
	ipc.server.off("socket.disconnected", disconnectListener)
} }]
