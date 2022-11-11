class BetterTimeout {
	public callback: (() => unknown) | null = null
	public delay: number | null = null
	public isActive = false
	public timeout: NodeJS.Timeout | null = null

	public setCallback(callback: () => unknown) {
		this.clear()
		this.callback = callback
		return this
	}

	public setDelay(delay: number) {
		this.clear()
		this.delay = delay
		return this
	}

	public run() {
		this.clear()
		if (this.callback && this.delay) {
			this.isActive = true
			this.timeout = setTimeout(() => this.callback?.(), this.delay)
		}
	}

	public triggerNow() {
		this.clear()
		if (this.callback) this.callback()
	}

	public clear() {
		this.isActive = false
		if (this.timeout) clearTimeout(this.timeout)
	}
}

export { BetterTimeout }
