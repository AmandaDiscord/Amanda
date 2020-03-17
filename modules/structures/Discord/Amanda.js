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

		/** @type {Discord.Collection<string, { host: string, regions: Array<string> }>} */
		this.regionMap = new Discord.Collection()
		this.regionMap.set("main", { host: "amanda.moe", regions: ["brazil", "us-central", "us-south", "us-east", "us-south"] })
		this.regionMap.set("asia", { host: "139.99.90.94", regions: ["eu-west", "hongkong", "japan", "singapore", "southafrica", "eu-central", "europe", "india", "russia", "south-korea", "sydney"] })

		/**
		 * Do not use this
		 * @type {import("../../../passthrough")}
		 * @private
		 */
		this.passthrough = passthrough
	}
}

module.exports = Amanda
