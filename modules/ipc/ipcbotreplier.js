// @ts-check

const types = require("../../typings")

const path = require("path")
const Discord = require("discord.js")
const mixinDeep = require("mixin-deep")

const passthrough = require("../../passthrough")
const { config, constants, client, reloader, ipc } = passthrough

const utils = require("../utilities.js")
reloader.sync("./modules/utilities.js", utils)

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
		nameAcronym: guild.nameAcronym
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
	REPLY_GET_GUILD(guildID) {
		const guild = client.guilds.cache.get(guildID)
		if (guild) return filterGuild(guild)
		else return null
	}

	/**
	 * @param {object} input
	 * @param {string} input.userID
	 * @param {boolean} input.np
	 */
	REPLY_GET_DASH_GUILDS({ userID, np }) {
		const manager = passthrough.queues
		const guilds = []
		const npguilds = []
		for (const guild of client.guilds.cache.values()) {
			if (guild.members.cache.has(userID)) {
				let isNowPlaying = false
				if (np) {
					if (manager && manager.cache.has(guild.id)) isNowPlaying = true
					if (guild.members.cache.get(userID).voice.channelID) isNowPlaying = true
				}
				if (isNowPlaying) npguilds.push(filterGuild(guild))
				else guilds.push(filterGuild(guild))
			}
		}
		return { guilds, npguilds }
	}

	/**
	 * @param {object} input
	 * @param {string} input.userID
	 * @param {string} input.guildID
	 */
	REPLY_GET_GUILD_FOR_USER({ userID, guildID }) {
		const guild = client.guilds.cache.get(guildID)
		if (!guild) return null
		if (!guild.members.cache.has(userID)) return null
		return filterGuild(guild)
	}

	/**
	 * @param {string} guildID
	 */
	REPLY_GET_QUEUE_STATE(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return null
		return queue.wrapper.getState()
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
		return utils.getStats()
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
		return {config, lavalinkNodes: constants.lavalinkNodes}
	}

	async requestPing() {
		const d = Date.now()
		await this.request("PING")
		return Date.now() - d
	}

	/**
	 * @return {Promise<import("snowtransfer/src/methods/Guilds").GuildMember>}
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
	sendNewQueue(queue) {
		this.ipc.send({ op: "NEW_QUEUE", data: { guildID: queue.guildID, state: queue.wrapper.getState() } })
	}

	sendDeleteQueue(guildID) {
		this.ipc.send({ op: "NEW_QUEUE", data: { guildID, state: null } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 * @param {import("../../commands/music/songtypes").Song} song
	 */
	sendAddSong(queue, song, position) {
		this.ipc.send({ op: "ADD_SONG", data: { guildID: queue.guildID, position, song: song.getState() } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendTimeUpdate(queue) {
		this.ipc.send({ op: "TIME_UPDATE", data: { guildID: queue.guildID, songStartTime: queue.songStartTime, playing: !queue.isPaused } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendNextSong(queue) {
		this.ipc.send({ op: "NEXT_SONG", data: { guildID: queue.guildID } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 * @param {import("../../commands/music/songtypes").Song} song
	 * @param {number} index
	 */
	sendSongUpdate(queue, song, index) {
		this.ipc.send({ op: "SONG_UPDATE", data: { guildID: queue.guildID, song: song.getState(), index: index } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 * @param {number} index
	 */
	sendRemoveSong(queue, index) {
		this.ipc.send({ op: "REMOVE_SONG", data: { guildID: queue.guildID, index: index } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendRemoveAllSongs(queue) {
		this.ipc.send({ op: "REMOVE_ALL_SONGS", data: { guildID: queue.guildID } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendMembersUpdate(queue) { // TODO: this is jank
		this.ipc.send({ op: "MEMBERS_UPDATE", data: { guildID: queue.guildID, members: queue.wrapper.getMembers() } })
	}

	/**
	 * @param {import("../../commands/music/queue").Queue} queue
	 */
	sendAttributesChange(queue) {
		this.ipc.send({ op: "ATTRIBUTES_CHANGE", data: { guildID: queue.guildID, attributes: queue.wrapper.getAttributes() } })
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
