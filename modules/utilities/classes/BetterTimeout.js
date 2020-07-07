class BetterTimeout {
	constructor() {
		this.callback = null
		/** @type {number} */
		this.delay = null
		this.isActive = false
		this.timeout = null
	}
	setCallback(callback) {
		this.clear()
		this.callback = callback
		return this
	}
	/**
	 * @param {number} delay
	 */
	setDelay(delay) {
		this.clear()
		this.delay = delay
		return this
	}
	run() {
		this.clear()
		if (this.callback && this.delay) {
			this.isActive = true
			this.timeout = setTimeout(() => this.callback(), this.delay)
		}
	}
	triggerNow() {
		this.clear()
		if (this.callback) this.callback()
	}
	clear() {
		this.isActive = false
		clearTimeout(this.timeout)
	}
}

module.exports = BetterTimeout
