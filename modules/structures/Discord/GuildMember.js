const Discord = require("discord.js");

const Structures = require("../");
const { Amanda, Guild } = Structures;

class GuildMember extends Discord.GuildMember {
	/**
	 * @param {Amanda} client
	 * @param {any} data
	 * @param {Guild} guild
	 */
	constructor(client, data, guild) {
		super(client, data, guild);
	}
	/**
	 * A String of this member's user tag and nickname or just their tag if a nickname isn't set
	 * @type {String}
	 * @readonly
	 */
	get displayTag() {
		return this.nickname ? `${this.user.tag} (${this.nickname})` : this.user.tag;
	}
}

Discord.Structures.extend("GuildMember", () => { return GuildMember; });
module.exports = GuildMember;