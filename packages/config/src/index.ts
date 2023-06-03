import path = require("path")

import type Sync = require("heatsync")
import type Config = require("../config")

class ConfigProvider {
	public config: typeof Config

	private changeCallbacks: Array<() => unknown> = []

	public constructor(sync: Sync) {
		let config: typeof Config
		let realLoaded = false
		try {
			config = sync.require("../../../config")
			realLoaded = true
		} catch {
			config = require("../../../config.example")
		}
		if (realLoaded) {
			sync.events.on(path.join(__dirname, "../../../config.js"), () => {
				for (const cb of this.changeCallbacks) cb()
			})
		}
		this.config = config
	}

	public addCallback(callback: () => unknown): this {
		this.changeCallbacks.push(callback)
		return this
	}

	public removeCallback(callback: () => unknown): this {
		const index = this.changeCallbacks.findIndex(c => c === callback)
		if (index !== -1) this.changeCallbacks.splice(index, 1)
		return this
	}
}

export = ConfigProvider
