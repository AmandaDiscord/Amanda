const Discord = require("discord.js");

const managers = require("../../managers");
const Structures = require("../");
const { Amanda, TextChannel, DMChannel, User, GuildMember, Guild } = Structures;

class Message extends Discord.Message {
	/**
	 * @param {Amanda} client
	 * @param {any} data
	 * @param {TextChannel|DMChannel} channel
	 */
	constructor(client, data, channel) {
		super(client, data, channel);
		/** @type {managers.ReactionMenu} */
		this.menu;
		/** @type {User} */
		this.author;
		/** @type {GuildMember} */
		this.member;
		/** @type {Guild} */
		this.guild;
	}
	/**
	 * @param {Array<managers.ReactionMenuAction>} actions
	 */
	reactionMenu(actions) {
		return new reactionMenu(this, actions);
	}
}

Discord.Structures.extend("Message", () => { return Message; });
module.exports = Message;