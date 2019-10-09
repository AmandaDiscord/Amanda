//@ts-check

const passthrough = require("../../../passthrough")

const Discord = require("discord.js")
const Lavalink = require("discord.js-lavalink")

class Amanda extends Discord.Client {
	/**
	 * @param {Discord.ClientOptions} [options]
	 */
	constructor(options) {
		super(options)

		/** @type {Lavalink.PlayerManager} */
		this.lavalink

		/** @type {any} do not use this. */
		this.passthrough = passthrough
	}
}

module.exports = Amanda
