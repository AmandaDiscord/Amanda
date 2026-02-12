import path = require("path")

import sync = require("@amanda/sync")

import type Config = require("../config")

/**
 * A wrapper around Amanda's config file which can auto reload
 * and notify subscribers of the changes that it was reloaded
 */
class ConfigProvider {
	/** The raw config JSON */
	public static config: typeof Config
	/** A set of sucscribers to push change callbacks to */
	public static readonly changeCallbacks = new Set<() => unknown>()

	/**
	 * Add a callback to get called whenever the config updates
	 * @param callback The callback to get called
	 * @returns The ConfigProvider to chain calls
	 */
	public static addCallback(callback: () => unknown): ConfigProvider {
		ConfigProvider.changeCallbacks.add(callback)
		return ConfigProvider
	}

	/**
	 * Remove a callback from receiving config updates
	 * @param callback The previously supplied callback
	 * @returns The ConfigProvider to chain calls
	 */
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
