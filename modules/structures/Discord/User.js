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
		let prefixes = ["Playing", "Streaming", "Listening to", "Watching"];
		return prefixes[this.presence.activity.type];
	}
}

Discord.Structures.extend("User", () => { return User; });
module.exports = User;