const Discord = require("discord.js");

const ReactionMenu = require("../../managers/Discord/ReactionMenu");
const Structures = require("../");
const { Amanda, TextChannel, DMChannel, User, GuildMember, Guild } = Structures;
const managers = require("../../managers");

class Message extends Discord.Message {
	/**
	 * @param {Amanda} client
	 * @param {any} data
	 * @param {Structures.TextChannel} channel
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
		return new ReactionMenu(this, actions);
	}
}

Discord.Structures.extend("Message", () => { return Message; });
module.exports = Message;
