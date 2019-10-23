// @ts-check

const types = require("../../typings")

class IPCRouter {
	/**
	 * @param {import("./ipcserver")} ipc
	 */
	constructor(ipc) {
		this.ipc = ipc
	}

	/**
	 * @param {string} guildID
	 * @returns {Promise<types.FilteredGuild>}
	 */
	requestGuild(guildID) {
		return this.ipc.requestFromGuild(guildID, "GET_GUILD", guildID)
	}

	/**
	 * @param {string} userID
	 * @param {boolean} np
	 * @returns {Promise<{guilds: ipctypes.FilteredGuild[], npguilds: ipctypes.FilteredGuild[]}>}
	 */
	requestDashGuilds(userID, np) {
		return this.ipc.requestAll("GET_DASH_GUILDS", { userID, np }, "concatProps")
	}

	/**
	 * Request a guild, but only if the user is in that guild.
	 * @param {string} userID
	 * @param {string} guildID
	 * @returns {Promise<types.FilteredGuild>}
	 */
	requestGuildForUser(userID, guildID) {
		return this.ipc.requestFromGuild(guildID, "GET_GUILD_FOR_USER", { userID, guildID })
	}

	/**
	 * Request a queue and all of its data.
	 * @param {string} guildID
	 */
	requestState(guildID) {
		return this.ipc.requestFromGuild(guildID, "GET_QUEUE_STATE", guildID)
	}

	/**
	 * Ask a queue to pause.
	 * @param {string} guildID
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestTogglePlayback(guildID) {
		return this.ipc.requestFromGuild(guildID, "TOGGLE_PLAYBACK", guildID)
	}

	/**
	 * Ask a queue to skip.
	 * @param {string} guildID
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestSkip(guildID) {
		return this.ipc.requestFromGuild(guildID, "SKIP", guildID)
	}

	/**
	 * Ask a queue to stop.
	 * @param {string} guildID
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestStop(guildID) {
		return this.ipc.requestFromGuild(guildID, "STOP", guildID)
	}

	/**
	 * Ask a queue to remove a song.
	 * @param {string} guildID
	 * @param {number} index
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestQueueRemove(guildID, index) {
		return this.ipc.requestFromGuild(guildID, "REMOVE_SONG", { guildID, index })
	}

	/**
	 * Ask a queue to toggle the auto state.
	 * @param {string} guildID
	 * @returns {Promise<boolean>} Whether the request was successful
	 */
	requestToggleAuto(guildID) {
		return this.ipc.requestFromGuild(guildID, "TOGGLE_AUTO", guildID)
	}

	async requestStats() {
		const stats = await this.ipc.requestAll("GET_STATS", undefined, null)
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

module.exports.router = IPCRouter
