const Discord = require("discord.js");

const Structures = require("../");
const { Amanda, User } = Structures;

class DMChannel extends Discord.DMChannel {
	/**
	 * @param {Amanda} client
	 * @param {any} [data]
	 */
	constructor(client, data) {
		super(client, data);

		/** @type {Amanda} */
		this.client;

		/** @type {User} */
		this.recipient;
	}
	/**
	 * Send a typing event that times out
	 * @returns {Promise<void>}
	 */
	sendTyping() {
		// @ts-ignore
		if (this.startTyping) void this.client.api[this.id].typing.post();
		else return Promise.reject(new TypeError("Channel is not a text channel, cannot sendTyping"));
	}
}
Discord.Structures.extend("DMChannel", () => { return DMChannel; });
module.exports = DMChannel;