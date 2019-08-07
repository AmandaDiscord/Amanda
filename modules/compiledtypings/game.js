const Discord = require("discord.js");

module.exports = class Game {
	/**
	 * @param {Discord.TextChannel|Discord.DMChannel|Discord.GroupDMChannel} channel
	 * @param {String} type
	 */
	constructor(channel, type) {
		this.channel = channel;
		this.type = type;
		this.manager = require("../managers").gameManager;
		this.id = channel.id;
		if (channel instanceof Discord.TextChannel) this.permissions = channel.permissionsFor(this.channel.client.user)
		else this.permissions = undefined;
	}
	init() {}
	destroy() {}
	start() {}
}