module.exports = class FrequencyUpdater {
	/**
	 * @param {Function} callback
	 */
	constructor(callback) {
		this.callback = callback
		this.timeout = null
		this.interval = null
	}
	/**
	 * @param {Number} frequency
	 * @param {Boolean} trigger
	 * @param {Number} delay
	 */
	start(frequency, trigger, delay = frequency) {}
	stop(trigger = false) {}
}