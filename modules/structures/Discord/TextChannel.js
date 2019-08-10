const Discord = require("discord.js");

const Structures = require("../");
const { Guild } = Structures;

class TextChannel extends Discord.TextChannel {
	/**
	 * @param {Guild} guild
	 * @param {any} [data]
	 */
	constructor(guild, data) {
		super(guild, data);
	}
	/**
	 * Send a typing event that times out
	 * @returns {Promise<void>}
	 */
	sendTyping() {
		if (this.startTyping) void this.client.api[this.id].typing.post();
		else return Promise.reject(new TypeError("Channel is not a text channel, cannot sendTyping"));
	}
}

Discord.Structures.extend("TextChannel", () => { return TextChannel; });
module.exports = TextChannel;