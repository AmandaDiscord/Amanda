//@ts-check

const ipctypes = require("../../modules/ipctypes.js")

const passthrough = require("../../passthrough")

class IPCRouter {
	/**
	 * @param {import("./ipcserver")} ipc
	 */
	constructor(ipc) {
		this.ipc = ipc
	}

	/**
	 * @param {string} guildID
	 * @returns {Promise<ipctypes.FilteredGuild>}
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
		return this.ipc.requestAll("GET_DASH_GUILDS", {userID, np}, "concatProps")
	}

	/**
	 * Request a guild, but only if the user is in that guild.
	 * @param {string} userID
	 * @param {string} guildID
	 * @returns {Promise<ipctypes.FilteredGuild>}
	 */
	requestGuildForUser(userID, guildID) {
		return this.ipc.requestFromGuild(guildID, "GET_GUILD_FOR_USER", {userID, guildID})
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
}

module.exports.router = IPCRouter
