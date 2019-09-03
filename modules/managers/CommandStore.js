//@ts-check

const Discord = require("discord.js")

/**
 * @extends Discord.Collection<string,Command>
 */
class CommandStore extends Discord.Collection {
	constructor() {
		super()
		/**
		 * @type {Map<string, Array<string>>}
		 */
		this.categories = new Map()
	}
	/**
	 * @param {Object.<string, Command>} properties
	 */
	assign(properties) {
		Object.values(properties).forEach(i => {
			if (this.get(i.aliases[0])) this.delete(i.aliases[0])
			this.set(i.aliases[0], i)
			let cat = this.categories.get(i.category)
			if (!cat) this.categories.set(i.category, [i.aliases[0]])
			else {
				if (!cat.includes(i.aliases[0])) cat.push(i.aliases[0])
			}
		});
	}
}

module.exports = CommandStore

/**
 * @typedef {Object} Command
 * @property {string} usage
 * @property {string} description
 * @property {string[]} aliases
 * @property {string} category
 * @property {(msg: Discord.Message, suffix?: string) => any} process
 */
