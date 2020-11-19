// @ts-check

const types = require("../../typings")

const path = require("path")
const Discord = require("thunderstorm")
const mixinDeep = require("mixin-deep")

const passthrough = require("../../passthrough")
const { config, constants, client, reloader, ipc } = passthrough

const utils = require("../utilities")
reloader.sync("./modules/utilities/index.js", utils)

const Replier = require("./ipcreplier")
utils.addTemporaryListener(reloader.reloadEvent, "ipcreplier.js", path.basename(__filename), () => {
	setImmediate(() => { // event is emitted synchronously before decache, so wait for next event loop
		reloader.resync("./modules/ipc/ipcbotreplier.js")
	})
}, "once")

/**
 * @param {Discord.Guild} guild
 * @returns {types.FilteredGuild}
 */
function filterGuild(guild) {
	return {
		id: guild.id,
		name: guild.name,
		icon: guild.icon,
		nameAcronym: guild.name.split(" ").map(it => it[0].toUpperCase()).join("")
	}
}

function getQueue(guildID) {
	const queueStore = passthrough.queues
	if (!queueStore) return null
	const queue = queueStore.cache.get(guildID)
	if (!queue) return null
	return queue
}

/**
 * - RECEIVE
 * - REPLY
 * - REQUEST
 * - SEND
 */
class ClientReplier extends Replier {
	constructor() {
		super()
		this.ipc = ipc
	}

	onMessage(raw) {
		this.baseOnMessage(raw, rawReply => this.ipc.send(rawReply))
	}

	request(op, data) {
		return this.baseRequest(op, data, raw => {
			this.ipc.send(raw)
		})
	}

	/**
	 * @param {string} guildID
	 */
	async REPLY_GET_GUILD(guildID) {
		const guild = await utils.cacheManager.guilds.get(guildID, true, false)
		// @ts-ignore
		if (guild) return filterGuild(guild)
		else return null
	}

	/**
	 * @param {object} input
	 * @param {string} input.userID
	 * @param {boolean} input.np
	 */
	async REPLY_GET_DASH_GUILDS({ userID, np }) {
		const manager = passthrough.queues
		const guilds = []
		const npguilds = []
		const gs = await passthrough.workers.cache.getData({ op: "GET_USER_GUILDS", params: { id: userID } })
		for (const guild of gs) {
			let isNowPlaying = false
			if (np) {
				if (manager && manager.cache.has(guild)) isNowPlaying = true
				if (await client.rain.cache.voiceState.get(userID, guild)) isNowPlaying = true
			}
			const g = await utils.cacheManager.guilds.get(guild, true, false)
			// @ts-ignore
			if (isNowPlaying) npguilds.push(filterGuild(g))
			// @ts-ignore
			else guilds.push(filterGuild(g))
		}
		return { guilds, npguilds }
	}

	/**
	 * @param {object} input
	 * @param {string} input.userID
	 * @param {string} input.guildID
	 */
	async REPLY_GET_GUILD_FOR_USER({ userID, guildID }) {
		const guild = await utils.cacheManager.guilds.get(guildID, true, false)
		if (!guild) return null
		const member = await client.rain.cache.member.isIndexed(userID, guildID)
		if (!member) return null
		// @ts-ignore
		return filterGuild(guild)
	}

	/**
	 * @param {string} guildID
	 */
	async REPLY_GET_QUEUE_STATE(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return null
		const state = await queue.wrapper.getState()
		return state
	}

	/**
	 * @param {string} guildID
	 */
	REPLY_TOGGLE_PLAYBACK(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return false
		return queue.wrapper.togglePlaying("web")
	}

	/**
	 * @param {string} guildID
	 */
	REPLY_SKIP(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return false
		queue.wrapper.skip()
		return true
	}

	/**
	 * @param {string} guildID
	 */
	REPLY_STOP(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return false
		queue.wrapper.stop()
		return true
	}

	/**
	 * @param {object} input
	 * @param {string} input.guildID
	 * @param {number} input.index
	 */
	REPLY_REMOVE_SONG({ guildID, index }) {
		const queue = getQueue(guildID)
		if (!queue) return false
		return queue.wrapper.removeSong(index, "web")
	}

	// eslint-disable-next-line require-await
	async REPLY_SAVE_QUEUES() {
		return passthrough.queues.save()
	}

	/**
	 * @param {string} guildID
	 */
	REPLY_TOGGLE_AUTO(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return false
		return queue.wrapper.toggleAuto("web")
	}

	/**
	 * @param {string} guildID
	 */
	REPLY_TOGGLE_LOOP(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return false
		return queue.wrapper.toggleLoop("web")
	}

	/**
	 * @param {string} guildID
	 */
	REPLY_CLEAR_QUEUE(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return false
		return queue.wrapper.removeAllSongs("web")
	}

	REPLY_GET_STATS() {
		return utils.getOwnStats()
	}

	REPLY_PING() {
		return true
	}

	/**
	 * @param {{config: any, lavalinkNodes: boolean[]}} data data to apply over config
	 */
	REPLY_UPDATE_CONFIG(data = undefined) {
		if (data && data.config) mixinDeep(config, data.config)
		if (data && data.lavalinkNodes) {
			constants.lavalinkNodes.forEach((n, i) => mixinDeep(n, data.lavalinkNodes[i]))
			utils.editLavalinkNodes.syncConnections()
		}
		return { config, lavalinkNodes: constants.lavalinkNodes }
	}

	async requestPing() {
		const d = Date.now()
		await this.request("PING")
		return Date.now() - d
	}

	/**
	 * @return {Promise<import("@amanda/discordtypings").MemberData>}
	 */
	requestGetGuildMember(guildID, userID) {
		return new Promise((resolve, reject) => {
			this.request("GET_GUILD_MEMBER", { guildID, userID }).then(result => {
				if (result.status == "ok") resolve(result.data)
				else reject(result.data)
			})
		})
	}

	/**
	 * Request and combine stats from all shards.
	 * @returns {Promise<types.CombinedShardStats>}
	 */
	requestGetAllStats() {
		return this.request("GET_ALL_STATS", null)
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	async sendNewQueue(queue) {
		const state = await queue.wrapper.getState()
		this.ipc.send({ op: "NEW_QUEUE", data: { guildID: queue.guild.id, state } })
	}

	sendDeleteQueue(guildID) {
		this.ipc.send({ op: "NEW_QUEUE", data: { guildID, state: null } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 * @param {import("../../commands/music/songtypes").Song} song
	 */
	sendAddSong(queue, song, position) {
		this.ipc.send({ op: "ADD_SONG", data: { guildID: queue.guild.id, position, song: song.getState() } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendTimeUpdate(queue) {
		this.ipc.send({ op: "TIME_UPDATE", data: { guildID: queue.guild.id, songStartTime: queue.songStartTime, pausedAt: queue.pausedAt, playing: !queue.isPaused } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendNextSong(queue) {
		this.ipc.send({ op: "NEXT_SONG", data: { guildID: queue.guild.id } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 * @param {import("../../commands/music/songtypes").Song} song
	 * @param {number} index
	 */
	sendSongUpdate(queue, song, index) {
		this.ipc.send({ op: "SONG_UPDATE", data: { guildID: queue.guild.id, song: song.getState(), index: index } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 * @param {number} index
	 */
	sendRemoveSong(queue, index) {
		this.ipc.send({ op: "REMOVE_SONG", data: { guildID: queue.guild.id, index: index } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendRemoveAllSongs(queue) {
		this.ipc.send({ op: "REMOVE_ALL_SONGS", data: { guildID: queue.guild.id } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendMembersUpdate(queue) {
		this.ipc.send({ op: "MEMBERS_UPDATE", data: { guildID: queue.guild.id, members: queue.wrapper.getMembers() } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendAttributesChange(queue) {
		this.ipc.send({ op: "ATTRIBUTES_CHANGE", data: { guildID: queue.guild.id, attributes: queue.wrapper.getAttributes() } })
	}

	sendBackgroundUpdateRequired() {
		this.ipc.send({ op: "BACKGROUND_UPDATE_REQUIRED", data: null })
	}

	sendPresenceAnnouncement(duration, message) {
		this.ipc.send({ op: "PRESENCE_ANNOUNCEMENT", data: { duration, message } })
	}
}

const replier = new ClientReplier()
const oldReplier = ipc.replier
if (oldReplier) {
	replier.receivers = oldReplier.receivers
	replier.outgoing = oldReplier.outgoing
}
ipc.setReplier(replier)

module.exports = ClientReplier
