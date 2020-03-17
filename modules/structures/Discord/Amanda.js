// @ts-check

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

		/** @type {Discord.Collection<string, { name: string, host: string, regions: Array<string> }>} */
		this.regionMap = new Discord.Collection()
		this.regionMap.set("americas", { name: "Pencil", host: "amanda.moe", regions: ["brazil", "us-central", "us-south", "us-east", "us-west", "eu-central", "europe", "eu-west", "sydney", "southafrica"] })
		this.regionMap.set("asia", { name: "Crayon", host: "139.99.90.94", regions: ["hongkong", "japan", "singapore", "india", "russia", "south-korea"] })

		/**
		 * Do not use this
		 * @type {import("../../../passthrough")}
		 * @private
		 */
		this.passthrough = passthrough
	}
}

module.exports = Amanda
