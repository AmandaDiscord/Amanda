// @ts-check

const Discord = require("discord.js")
const Lang = require("@amanda/lang")

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
			this.categories.forEach(c => {
				if (c.includes(i.aliases[0])) c.splice(c.indexOf(i.aliases[0]), 1)
			})
			const cat = this.categories.get(i.category)
			if (!cat) this.categories.set(i.category, [i.aliases[0]])
			else if (!cat.includes(i.aliases[0])) cat.push(i.aliases[0])
		})
	}
	/**
	 * @param {Array<string>} commands
	 */
	remove(commands) {
		for (const command of commands) {
			if (this.get(command)) {
				this.delete(command)
				this.categories.forEach(c => {
					if (c.includes(command)) c.splice(c.indexOf(command), 1)
				})
			}
		}
	}
}

module.exports = CommandStore

/**
 * @typedef {Object} Command
 * @property {string} usage
 * @property {string} description
 * @property {string[]} aliases
 * @property {string} category
 * @property {(msg: Discord.Message, suffix?: string, lang?: Lang.Lang) => any} process
 */
