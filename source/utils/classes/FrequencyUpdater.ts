class FrequencyUpdater {
	public callback: () => unknown
	public timeout: NodeJS.Timeout | null
	public interval: NodeJS.Timeout | null

	public constructor(callback: () => unknown) {
		this.callback = callback
		this.timeout = null
		this.interval = null
	}

	public start(frequency: number, trigger: boolean, delay = frequency) {
		this.stop(false)
		if (trigger) this.callback()
		this.timeout = setTimeout(() => {
			this.callback()
			this.interval = setInterval(() => {
				this.callback()
			}, frequency)
			this.timeout = null
		}, delay)
	}

	public stop(trigger = false) {
		if (this.timeout) clearTimeout(this.timeout)
		if (this.interval) clearInterval(this.interval)
		this.timeout = null
		this.interval = null
		if (trigger) this.callback()
	}
}

export = FrequencyUpdater
