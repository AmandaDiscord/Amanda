const Discord = require("discord.js");

/**
 * @extends {Discord.Collection<String, {usage: String, description: String, aliases: Array<String>, category: String, process: (msg: Discord.Message, suffix?: String) => any}>}
 */
module.exports = class CommandStore extends Discord.Collection {
	constructor() {
		super();
		/**
		 * @type {Map<String, Array<String>>}
		 */
		this.categories = new Map();
	}
	/**
	 * @param {Object.<string, {usage: String, description: String, aliases: Array<String>, category: String, process: (msg: Discord.Message, suffix?: String) => any}>} properties
	 */
	assign(properties) {
		Object.values(properties).forEach(i => {
			if (this.get(i.aliases[0])) this.delete(i.aliases[0]);
			this.set(i.aliases[0], i);
			let cat = this.categories.get(i.category);
			if (!cat) this.categories.set(i.category, [i.aliases[0]]);
			else {
				if (!cat.includes(i.aliases[0])) cat.push(i.aliases[0]);
			}
		});
	}
}