//@ts-check

const ipctypes = require("./ipctypes")

const Discord = require("discord.js")

const passthrough = require("../passthrough")
const {client} = passthrough

/**
 * @param {Discord.Guild} guild
 * @returns {ipctypes.FilteredGuild}
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
	const queueStore = passthrough.queueStore
	if (!queueStore) return null
	const queue = queueStore.get(guildID)
	if (!queue) return null
	return queue
}

class IPCRouter {
	/**
	 * @param {import("./ipcbot")} ipc
	 */
	constructor(ipc) {
		this.ipc = ipc
		this.send = new Send(ipc)
	}

	/**
	 * @param {string} guildID
	 */
	GET_GUILD(guildID) {
		let guild = client.guilds.get(guildID)
		if (guild) {
			return filterGuild(guild)
		} else {
			return null
		}
	}

	/**
	 * @param {object} input
	 * @param {string} input.userID
	 * @param {boolean} input.np
	 */
	GET_DASH_GUILDS({userID, np}) {
		const queueStore = passthrough.queueStore
		let guilds = []
		let npguilds = []
		for (let guild of client.guilds.values()) {
			if (guild.members.has(userID)) {
				let isNowPlaying = false
				if (np) {
					if (queueStore && queueStore.store.has(guild.id)) isNowPlaying = true
					if (guild.members.get(userID).voice.channelID) isNowPlaying = true
				}
				if (isNowPlaying) npguilds.push(filterGuild(guild))
				else guilds.push(filterGuild(guild))
			}
		}
		return {guilds, npguilds}
	}

	/**
	 * @param {object} input
	 * @param {string} input.userID
	 * @param {string} input.guildID
	 */
	GET_GUILD_FOR_USER({userID, guildID}) {
		const guild = client.guilds.get(guildID)
		if (!guild) return null
		if (!guild.members.has(userID)) return null
		return filterGuild(guild)
	}

	/**
	 * @param {string} guildID
	 */
	GET_QUEUE_STATE(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return null
		return queue.wrapper.getState()
	}

	/**
	 * @param {string} guildID
	 */
	TOGGLE_PLAYBACK(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return false
		return queue.wrapper.togglePlaying("web")
	}

	/**
	 * @param {string} guildID
	 */
	SKIP(guildID) {
		const queue = getQueue(guildID)
		if (!queue) return false
		queue.wrapper.skip()
		return true
	}

	/**
	 * @param {string} guildID
	 */
	STOP(guildID) {
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
	REMOVE_SONG({guildID, index}) {
		const queue = getQueue(guildID)
		if (!queue) return false
		return queue.wrapper.removeSong(index, "web")
	}
}

class Send {
	/**
	 * @param {import("./ipcbot")} ipc
	 */
	constructor(ipc) {
		this.ipc = ipc
	}

	/**
	 * @param {import("../commands/music/queue").Queue} queue
	 */
	newQueue(queue) {
		this.ipc.send({op: "NEW_QUEUE", data: {guildID: queue.guildID, state: queue.wrapper.getState()}})
	}

	deleteQueue(guildID) {
		this.ipc.send({op: "NEW_QUEUE", data: {guildID, state: null}})
	}

	/**
	 * @param {import("../commands/music/queue").Queue} queue
	 * @param {import("../commands/music/songtypes").Song} song
	 */
	addSong(queue, song, position) {
		this.ipc.send({op: "ADD_SONG", data: {guildID: queue.guildID, position, song: song.getState()}})
	}

	/**
	 * @param {import("../commands/music/queue").Queue} queue
	 */
	updateTime(queue) {
		this.ipc.send({op: "TIME_UPDATE", data: {guildID: queue.guildID, songStartTime: queue.songStartTime, playing: !queue.isPaused}})
	}

	/**
	 * @param {import("../commands/music/queue").Queue} queue
	 */
	nextSong(queue) {
		this.ipc.send({op: "NEXT_SONG", data: {guildID: queue.guildID}})
	}

	/**
	 * @param {import("../commands/music/queue").Queue} queue
	 * @param {import("../commands/music/songtypes").Song} song
	 * @param {number} index
	 */
	updateSong(queue, song, index) {
		this.ipc.send({op: "SONG_UPDATE", data: {guildID: queue.guildID, song: song.getState(), index: index}})
	}

	/**
	 * @param {import("../commands/music/queue").Queue} queue
	 * @param {number} index
	 */
	removeSong(queue, index) {
		this.ipc.send({op: "REMOVE_SONG", data: {guildID: queue.guildID, index: index}})
	}

	/**
	 * @param {import("../commands/music/queue").Queue} queue
	 */
	updateMembers(queue) {
		this.ipc.send({op: "MEMBERS_UPDATE", data: {guildID: queue.guildID, members: queue.wrapper.getMembers()}})
	}
}

module.exports.router = IPCRouter
