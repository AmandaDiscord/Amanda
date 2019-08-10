const Discord = require("discord.js");

const Structures = require("../");
const { Amanda, Message } = Structures;

class MessageReaction extends Discord.MessageReaction {
	/**
	 * @param {Amanda} client
	 * @param {any} data
	 * @param {Message} message
	 */
	constructor(client, data, message) {
		super(client, data, message);
	}
}

Discord.Structures.extend("MessageReaction")