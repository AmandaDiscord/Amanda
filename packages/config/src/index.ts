import path = require("path")

import sync = require("@amanda/sync")

import type Config = require("../config")

class ConfigProvider {
	public static config: typeof Config

	public static changeCallbacks: Array<() => unknown> = []

	public static addCallback(callback: () => unknown): ConfigProvider {
		ConfigProvider.changeCallbacks.push(callback)
		return ConfigProvider
	}

	public static removeCallback(callback: () => unknown): ConfigProvider {
		const index = ConfigProvider.changeCallbacks.findIndex(c => c === callback)
		if (index !== -1) ConfigProvider.changeCallbacks.splice(index, 1)
		return ConfigProvider
	}
}

const toConfig = path.join(__dirname, "../../../config.js")

let config: typeof Config
let realLoaded = false

try {
	config = sync.require(toConfig)
	realLoaded = true
} catch {
	config = require("../../../config.example")
}

if (realLoaded) {
	sync.events.on(toConfig, () => {
		for (const cb of ConfigProvider.changeCallbacks) cb()
	})
}
ConfigProvider.config = config

export = ConfigProvider
