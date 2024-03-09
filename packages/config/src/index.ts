import path = require("path")

import sync = require("@amanda/sync")

import type Config = require("../config")

class ConfigProvider {
	public static config: typeof Config

	public static readonly changeCallbacks = new Set<() => unknown>()

	public static addCallback(callback: () => unknown): ConfigProvider {
		ConfigProvider.changeCallbacks.add(callback)
		return ConfigProvider
	}

	public static removeCallback(callback: () => unknown): ConfigProvider {
		ConfigProvider.changeCallbacks.delete(callback)
		return ConfigProvider
	}
}

const toConfig = path.join(__dirname, "../../../config.js")
const toExample = path.join(__dirname, "../../../config.example.js")

let config: typeof Config
let realLoaded = false

try {
	config = sync.require(toConfig)
	realLoaded = true
} catch {
	config = require(toExample)
}

if (realLoaded) {
	sync.events.on(toConfig, () => {
		for (const cb of ConfigProvider.changeCallbacks) cb()
	})
}
ConfigProvider.config = config

export = ConfigProvider
