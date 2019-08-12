const Discord = require("discord.js");

const Structures = require("../");
const { Amanda } = Structures;

class User extends Discord.User {
	/**
	 * @param {Amanda} client
	 * @param {any} data
	 */
	constructor(client, data) {
		super(client, data);
	}
	/**
	 * If the user has an activity set return the prefix to the activity
	 * @returns {"Playing"|"Streaming"|"Listening to"|"Watching"}
	 * @readonly
	 */
	get activityPrefix() {
		if (this.presence && this.presence.activity == null) return null;
		let prefixes = {
			PLAYING: "Playing",
			STREAMING: "Streaming",
			LISTENING: "Listening to",
			WATCHING: "Watching"
		}
		return prefixes[this.presence.activity.type];
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
	get activeOn() {
		let cs = this.presence.clientStatus;
		if (!cs) return `Offline`;
		if (cs) {
			return `Active on ${cs.desktop?"Desktop":""}${cs.desktop&&cs.web?" and ":""}${cs.web?"Web":""}${(cs.desktop&&cs.mobile)||(cs.web&&cs.mobile)?" and ":""}${cs.mobile?" Mobile":""}`;
		}
	}
}

Discord.Structures.extend("User", () => { return User; });
module.exports = User;