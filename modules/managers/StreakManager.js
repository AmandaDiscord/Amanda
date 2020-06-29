const Discord = require("discord.js")

class StreakManager {
	constructor() {
		/** @type {Discord.Collection<string, { ID: string, command: string, amount: number }>} */
		this.cache = new Discord.Collection()
	}
	/**
	 * @param {{ max: number, step: number, command: string, userID: string }} info
	 * @param {boolean} [increment=false]
	 */
	calculate(info, increment = false) {
		const data = this.cache.get(`${info.userID}-${info.command}`)
		if (!data) {
			this.cache.set(`${info.userID}-${info.command}`, { ID: info.userID, command: info.command, amount: 0 })
			return 0
		}
		if (increment) this.increment(info.userID, info.command)
		return info.step * (data.amount >= info.max ? info.max : data.amount)
	}
	/**
	 * @param {string} userID
	 * @param {string} command
	 */
	getStreak(userID, command) {
		const data = this.cache.get(`${userID}-${command}`)
		if (!data) {
			this.cache.set(`${userID}-${command}`, { ID: userID, command: command, amount: 0 })
			return 0
		} else return data.amount
	}
	/**
	 * Increments a streak amount for a command. returns 0 if no data and the incremented amount on success
	 * @param {string} userID
	 * @param {string} command
	 */
	increment(userID, command) {
		const data = this.cache.get(`${userID}-${command}`)
		if (!data) {
			this.cache.set(`${userID}-${command}`, { ID: userID, command: command, amount: 0 })
			return 0
		}
		data.amount++
		return data.amount + 1
	}
	/**
	 * @param {string} userID
	 * @param {string} command
	 */
	delete(userID, command) {
		return this.cache.delete(`${userID}-${command}`)
	}
}

module.exports = StreakManager
