const Discord = require("discord.js");

const Structures = require("../structures");
const managers = require("../managers");

module.exports = class Game {
	/**
	 * @param {Structures.TextChannel|Structures.DMChannel} channel
	 * @param {String} type
	 */
	constructor(channel, type) {
		this.channel = channel;
		this.type = type;
		/** @type {managers.GameManager} */
		this.manager;
		this.id = channel.id;
		if (channel instanceof Structures.TextChannel) this.permissions = channel.permissionsFor(this.channel.client.user)
		else this.permissions = undefined;
	}
	init() {}
	destroy() {}
	start() {}
}