module.exports = class BetterTimeout {
	/**
	 * @param {Function} callback
	 * @param {Number} delay
	 * @constructor
	 */
	constructor(callback, delay) {
		this.callback = callback;
		this.delay = delay;
		this.isActive = true;
		this.timeout = 0;
	}
	triggerNow() {}
	clear() {}
}