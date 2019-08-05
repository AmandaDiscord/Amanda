const Discord = require("discord.js");

module.exports = class Game {
	/**
	 * @param {Discord.TextChannel} channel
	 * @param {String} type
	 */
	constructor(channel, type) {
		this.channel = channel;
		this.type = type;
		this.manager = require("../managers").gameManager;
		this.id = channel.id;
		this.permissions = channel.type!="dm"?channel.permissionsFor(client.user):undefined;
	}
	init() {}
	destroy() {}
	start() {}
}