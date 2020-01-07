// @ts-check

const types = require("../../typings")

const path = require("path")

const passthrough = require("../passthrough")
const { reloader, ipc } = passthrough

const utils = require("../modules/utilities")

const Replier = require("../../modules/ipc/ipcreplier")
utils.addTemporaryListener(reloader.reloadEvent, "ipcreplier.js", path.basename(__filename), () => {
	setImmediate(() => { // event is emitted synchronously before decache, so wait for next event loop
		reloader.forceResync("./website/modules/ipcserverreplier.js")
	})
}, "once")

class ServerReplier extends Replier {
	/**
	 * @param {import("./ipcserver")} ipc
	 */
	constructor(ipc) {
		super()
		this.ipc = ipc
	}

	async onMessage(socket, raw) {
		this.baseOnMessage(raw, reply => this.ipc.send(socket, reply))
	}

	requestFromShard(shardID, op, data) {
		// 3. request to a client
		return this.baseRequest(op, data, raw => {
			const socket = this.ipc.getShard(shardID)
			this.ipc.send(socket, raw)
		})
	}

	/**
	 * Get the socket that corresponds to a guild ID.
	 */
	getShardIDForGuild(id) {
		return Number((BigInt(id) >> BigInt(22)) % BigInt(this.ipc.totalShards))
	}

	requestFromGuild(guildID, op, data) {
		return this.requestFromShard(this.getShardIDForGuild(guildID), op, data)
	}

	broadcast(op, data) {
		const raw = { op, data }
		this.ipc.broadcast(raw)
	}

	/**
	 * Request information from all sockets. Combines the data and returns the result.
	 * @param {string} op
	 * @param {any} data
	 * @param {"truthy"|"concat"|"concatProps"|"add"|"addProps"|null} combineMethod
	 */
	requestAll(op, data, combineMethod = null) {
		const connectedClientCount = this.ipc.server.sockets.length
		if (connectedClientCount === 0) {
			return Promise.reject(new Error("No clients connected, requestAll would never resolve."))
		}
		const raw = this.buildRequest(op, data)
		this.ipc.broadcast(raw)
		return new Promise(resolve => {
			const parts = []
			this.outgoingPersist.add(raw.threadID)
			this.outgoing.set(raw.threadID, part => {
				parts.push(part)
				if (parts.length === connectedClientCount) {
					if (combineMethod === "truthy") {
						resolve(parts.find(p => p))
					} else if (combineMethod === "concat") {
						resolve([].concat(...parts))
					} else if (combineMethod === "concatProps") {
						//console.log(parts)
						let result = {}
						let keys = Object.keys(parts[0])
						keys.forEach(k => {
							result[k] = [].concat(...parts.map(p => p[k]))
						})
						//console.log(result)
						resolve(result)
					} else if (combineMethod === "add") {
						resolve(parts.reduce((acc, cur) => (acc + cur), 0))
					} else if (combineMethod === "addProps") {
						const result = parts.reduce((acc, part) => {
							Object.keys(part).forEach(key => {
								if (acc[key]) {
									acc[key] += part[key]
								} else {
									acc[key] = part[key]
								}
							})
							return acc
						}, {})
						resolve(result)
					} else {
						resolve(parts)
					}
				}
			})
		}).then(result => {
			this.outgoing.delete(raw.threadID)
			this.outgoingPersist.delete(raw.threadID)
			return result
		})
	}



	// === * === * === * === * === * === * === * === * === * === * === * === * === * === * === * ===



	REPLY_PING() {
		return true
	}

	RECEIVE_BACKGROUND_UPDATE_REQUIRED() {
		this.broadcast("BACKGROUND_UPDATE_REQUIRED", null)
	}

	RECEIVE_PRESENCE_ANNOUNCEMENT(data) {
		this.broadcast("PRESENCE_ANNOUNCEMENT", data)
	}

	async requestPing() {
		const d = Date.now()
		await this.requestAll("PING", undefined, null)
		return Date.now() - d
	}

	/**
	 * @param {string} guildID
	 * @returns {Promise<types.FilteredGuild>}
	 */
	requestGetGuild(guildID) {
		return this.requestFromGuild(guildID, "GET_GUILD", guildID)
	}

	/**
	 * @param {string} userID
	 * @param {boolean} np
	 * @returns {Promise<{guilds: types.FilteredGuild[], npguilds: types.FilteredGuild[]}>}
	 */
	requestGetDashGuilds(userID, np) {
		return this.requestAll("GET_DASH_GUILDS", { userID, np }, "concatProps")
	}

	/**
	 * Request a guild, but only if the user is in that guild.
	 * @param {string} userID
	 * @param {string} guildID
	 * @returns {Promise<types.FilteredGuild>}
	 */
	requestGetGuildForUser(userID, guildID) {
		return this.requestFromGuild(guildID, "GET_GUILD_FOR_USER", { userID, guildID })
	}

	/**
	 * Request a queue and all of its data.
	 * @param {string} guildID
	 */
	requestGetQueueState(guildID) {
		return this.requestFromGuild(guildID, "GET_QUEUE_STATE", guildID)
	}

	/**
	 * Ask a queue to pause.
	 * @param {string} guildID
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestTogglePlayback(guildID) {
		return this.requestFromGuild(guildID, "TOGGLE_PLAYBACK", guildID)
	}

	/**
	 * Ask a queue to skip.
	 * @param {string} guildID
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestSkip(guildID) {
		return this.requestFromGuild(guildID, "SKIP", guildID)
	}

	/**
	 * Ask a queue to stop.
	 * @param {string} guildID
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestStop(guildID) {
		return this.requestFromGuild(guildID, "STOP", guildID)
	}

	/**
	 * Ask a queue to remove a song.
	 * @param {string} guildID
	 * @param {number} index
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestQueueRemove(guildID, index) {
		return this.requestFromGuild(guildID, "REMOVE_SONG", { guildID, index })
	}

	/**
	 * Ask a queue to toggle the auto state.
	 * @param {string} guildID
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestToggleAuto(guildID) {
		return this.requestFromGuild(guildID, "TOGGLE_AUTO", guildID)
	}

	async requestGetStats() {
		const stats = await this.requestAll("GET_STATS", undefined, null)
		const combined = {
			ping: [],
			uptime: [],
			ram: [],
			combinedRam: 0,
			users: 0,
			guilds: 0,
			channels: 0,
			connections: 0
		}
		Object.keys(combined).forEach(key => {
			stats.forEach(s => {
				// Special properties (key name is different)
				if (key === "combinedRam") {
					combined[key] += s.ram
				}
				// Other properties (key name is the same)
				else {
					if (combined[key] instanceof Array) combined[key].push(s[key])
					else combined[key] += s[key]
				}
			})
		})
		return combined
	}
}

const replier = new ServerReplier(ipc)
const oldReplier = ipc.replier
if (oldReplier) {
	replier.receivers = oldReplier.receivers
	replier.outgoing = oldReplier.outgoing
}
ipc.setReplier(replier)

module.exports = ServerReplier
