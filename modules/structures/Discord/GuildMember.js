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
	get activityEmoji() {
		let presences = {
			online: "<:online:606664341298872324>",
			idle: "<:idle:606664341353267221>",
			dnd: "<:dnd:606664341269381163>",
			offline: "<:invisible:606662982558154774>"
		};
		return presences[this.presence.status];
	}
}

Discord.Structures.extend("GuildMember", () => { return GuildMember; });
module.exports = GuildMember;