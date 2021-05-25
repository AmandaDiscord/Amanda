// @ts-check

const types = require("../../typings")

const path = require("path")

const passthrough = require("../passthrough")
const { ipc } = passthrough


const Replier = require("../../modules/ipc/ipcreplier")

class ServerReplier extends Replier {
	/**
	 * @param {import("./ipcserver")} ipcserver
	 */
	constructor(ipcserver) {
		super()
		this.ipc = ipcserver
	}

	async onMessage(socket, raw) {
		this.baseOnMessage(raw, reply => this.ipc.send(socket, reply))
	}

	requestFromCluster(clusterID, op, data) {
		// 3. request to a client
		return this.baseRequest(op, data, raw => {
			const socket = this.ipc.getCluster(clusterID)
			this.ipc.send(socket, raw)
		})
	}

	/**
	 * Get the socket that corresponds to a guild ID.
	 */
	getShardIDForGuild(id, clientID = passthrough.clientID) {
		const preferred = this.getShardsForClient(clientID)
		return Number((BigInt(id) >> BigInt(22)) % BigInt(preferred.length ? preferred.length : this.getShardsForClient(this.getIdealClient()).length))
	}

	getIdealClient() {
		return this.ipc.clusterShards.find(item => item.clientID === passthrough.clientID) ? passthrough.clientID : (this.ipc.clusterShards.first() ? this.ipc.clusterShards.first().clientID : passthrough.clientID)
	}

	getShardsForClient(id) {
		/** @type {Array<number>} */
		const shards = []
		for (const cluster of this.ipc.clusterShards.values()) {
			if (cluster.clientID === id) cluster.shards.forEach((item) => shards.push(item))
		}
		return shards
	}

	requestFromGuild(guildID, op, data) {
		const ideal = this.getIdealClient()
		const shardID = this.getShardIDForGuild(guildID)
		let cluster
		for (const key of this.ipc.clusterShards.keys()) {
			const entry = this.ipc.clusterShards.get(key)
			if (entry.clientID === ideal && entry.shards.includes(shardID)) cluster = key
		}
		if (!cluster) return Promise.reject(new Error("No cluster connected to requestFromGuild"))
		return this.requestFromCluster(cluster, op, data)
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
		let expecting = connectedClientCount
		if (["GET_STATS"].includes(op)) {
			const preferred = this.getIdealClient()
			const total = this.ipc.clusterShards.filter(item => item.clientID === preferred).size
			if (total === 0) return Promise.reject(new Error("No preferred clients connected, requestAll would never resolve."))
			expecting = total
			for (const [key, value] of this.ipc.clusterShards) {
				if (value.clientID === preferred) this.ipc.send(this.ipc.clusters.get(key), raw)
			}
		} else this.ipc.broadcast(raw)
		return new Promise(resolve => {
			const parts = []
			this.outgoingPersist.add(raw.threadID)
			this.outgoing.set(raw.threadID, part => {
				parts.push(part)
				if (parts.length === expecting) {
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
						const result = parts.reduce((acc, p) => {
							Object.keys(p).forEach(key => {
								if (acc[key]) {
									acc[key] += p[key]
								} else {
									acc[key] = p[key]
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

	REPLY_GET_ALL_STATS() {
		return this.requestGetStats()
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

	/**
	 * Ask a queue to toggle the loop state.
	 * @param {string} guildID
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestToggleLoop(guildID) {
		return this.requestFromGuild(guildID, "TOGGLE_LOOP", guildID)
	}

	/**
	 * Request and combine stats from all clusters.
	 * @returns {Promise<types.CombinedClusterStats>}
	 */
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

	requestSaveQueues() {
		return this.requestAll("SAVE_QUEUES", null, "concat")
	}

	/**
	 * Clear all songs in a queue, except the currently playing one.
	 * @param {string} guildID
	 */
	requestClearQueue(guildID) {
		return this.requestFromGuild(guildID, "CLEAR_QUEUE", guildID)
	}

	/**
	 * Apply settings to the config of all connected clusters.
	 * @param {any} data data to apply over config
	 */
	requestUpdateConfig(data = undefined) {
		return this.requestAll("UPDATE_CONFIG", data, "concat")
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
