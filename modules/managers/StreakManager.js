const Discord = require("thunderstorm")

class StreakManager {
	constructor() {
		/** @type {Discord.Collection<string, { ID: string, command: string, amount: number, timeout?: NodeJS.Timeout }>} */
		this.cache = new Discord.Collection()
		/** @type {Map<string, number>} */
		this.destructionDurations = new Map()
	}
	/**
	 * For `info.maxMultiplier`: Mutiply the max by this number to get a "new max" to clamp to.
	 *
	 * For `info.multiplierStep`: How much more should be added to the original calculated amount multiplied by how many steps it took to get to the clamped max. (original + (stepsTaken * info.multiplierStep))
	 *
	 * For `info.absoluteMax`: The ABSOLUTE max amount `info.maxMultiplier` can clamp to
	 *
	 * @param {{ max: number, step: number, command: string, userID: string, maxMultiplier?: number, multiplierStep?: number, absoluteMax?: number }} info
	 * @param {boolean} [increment=false]
	 */
	calculate(info, increment = false) {
		const data = this.cache.get(`${info.userID}-${info.command}`)
		if (!data) return this.create(info.userID, info.command)
		if (increment) this.increment(info.userID, info.command)
		const original = info.step * (data.amount >= info.max ? info.max : data.amount)
		if (info.maxMultiplier && info.multiplierStep && data.amount >= (info.max * info.maxMultiplier)) {
			return original + (Math.floor(Math.log10(data.amount > info.absoluteMax ? info.absoluteMax : data.amount)) * info.multiplierStep) - info.multiplierStep
		} else return original
	}
	/**
	 * @param {string} userID
	 * @param {string} command
	 */
	create(userID, command) {
		const timeout = this.getDestroyDuration(command)
		this.cache.set(`${userID}-${command}`, { ID: userID, command: command, amount: 0, timeout: timeout ? setTimeout(() => this.delete(userID, command), timeout) : false })
		return 0
	}
	/**
	 * @param {string} userID
	 * @param {string} command
	 */
	getStreak(userID, command) {
		const data = this.cache.get(`${userID}-${command}`)
		if (!data) return this.create(userID, command)
		else return data.amount
	}
	/**
	 * Increments a streak amount for a command. returns 0 if no data and the incremented amount on success
	 * @param {string} userID
	 * @param {string} command
	 */
	increment(userID, command) {
		const data = this.cache.get(`${userID}-${command}`)
		if (!data) return this.create(userID, command)
		data.amount++
		if (data.timeout) {
			const timeout = this.getDestroyDuration(command)
			clearTimeout(data.timeout)
			data.timeout = timeout ? setTimeout(() => this.delete(userID, command), timeout) : false
		}
		return data.amount + 1
	}
	/**
	 * @param {string} userID
	 * @param {string} command
	 */
	delete(userID, command) {
		return this.cache.delete(`${userID}-${command}`)
	}
	/**
	 * @param {string} command
	 * @param {number} [duration=0] The duration in ms (0 for no destruction). Defaults to 0
	 */
	setDestroyDuration(command, duration = 0) {
		this.destructionDurations.set(command, duration)
	}
	/**
	 * @param {string} command
	 */
	getDestroyDuration(command) {
		return this.destructionDurations.get(command) || 0
	}
}

module.exports = StreakManager
