module.exports = class BetterTimeout {
	/**
	 * @param {(...args: Array<any>) => void} callback
	 * @param {Number} delay
	 * @constructor
	 */
	constructor(callback, delay) {
		this.callback = callback;
		this.delay = delay;
		this.isActive = true;
		this.timeout = setTimeout(this.callback, this.delay);
	}
	triggerNow() {}
	clear() {}
}