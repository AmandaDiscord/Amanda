// @ts-check

const Discord = require("thunderstorm")
const Lavalink = require("lavacord")

const passthrough = require("../../../passthrough")

class Amanda extends Discord.Client {
	/**
	 * @param {Discord.ClientOptions} [options]
	 */
	constructor(options) {
		super(options)

		/** @type {Lavalink.Manager} */
		this.lavalink

		/**
		 * Do not use this
		 * @type {import("../../../passthrough")}
		 * @private
		 */
		this.passthrough = passthrough
	}
}

module.exports = Amanda
