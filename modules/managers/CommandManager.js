// @ts-check

const Discord = require("discord.js")
const Lang = require("@amanda/lang")


class CommandManager {
	constructor() {
		/**
		 * @type {Discord.Collection<string, Command>}
		 */
		this.cache = new Discord.Collection()
		/**
		 * @type {Map<string, Array<string>>}
		 */
		this.categories = new Map()
	}
	/**
	 * @param {Array<Command>} properties
	 */
	assign(properties) {
		properties.forEach(i => {
			if (this.cache.get(i.aliases[0])) this.cache.delete(i.aliases[0])
			this.cache.set(i.aliases[0], i)
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
			if (this.cache.get(command)) {
				this.cache.delete(command)
				this.categories.forEach(c => {
					if (c.includes(command)) c.splice(c.indexOf(command), 1)
				})
			}
		}
	}
}

module.exports = CommandManager

/**
 * @typedef {Object} Command
 * @property {string} usage
 * @property {string} description
 * @property {string[]} aliases
 * @property {string} category
 * @property {string} [example]
 * @property {(msg: Discord.Message, suffix?: string, lang?: Lang.Lang) => any} process
 */
