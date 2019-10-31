// @ts-check

const fs = require("fs")
const path = require("path")
const events = require("events")
const pj = path.join

function localPath(dir) {
	return pj(__dirname, "..", dir)
}

const currentYear = new Date().getFullYear()

module.exports = class Reloader {
	constructor() {
		this.watchers = new Map()
		this.syncers = []
		this.reloadEvent = new events.EventEmitter()
	}
	/**
	 * Set up a file to be watched and reloaded in the future.
	 * @param {Array<string>} filenames
	 */
	setupWatch(filenames) {
		filenames.forEach(filename => {
			filename = localPath(filename)
			if (!this.watchers.has(filename)) {
				console.log("Watching " + filename)
				this.watchers.set(filename,
					fs.watchFile(filename, { interval: currentYear }, () => {
						console.log("Changed " + filename)
						this._doSync(filename)
					})
				)
			}
		})
		return this
	}
	/**
	 * Load files and watch them so they can be reloaded automatically. This is for commands.
	 * @param {Array<string>} filenames
	 */
	watchAndLoad(filenames) {
		this.setupWatch(filenames)
		filenames.forEach(filename => {
			this._doSync(localPath(filename))
		})
		return this
	}
	/**
	 * Keep an object in sync with its file contents
	 * @param {string} filename
	 * @param {Object} object Properties will be assigned to this from the file
	 */
	useSync(filename, object) {
		filename = localPath(filename)
		if (!this.watchers.has(filename)) {
			throw new Error(
				`Reloader: asked to keep object in sync with ${filename}, `
			+ "but that file is not being watched.")
		}
		this.syncers.push({ filename, object })
		return this
	}
	/**
	 * Perform a synchronization with the previously registered objects
	 * @param {string} filename
	 * @private
	 */
	_doSync(filename) {
		this.reloadEvent.emit(path.basename(filename))
		const syncers = this.syncers.filter(o => o.filename == filename)
		delete require.cache[require.resolve(filename)]
		const result = require(filename)
		syncers.forEach(syncer => Object.assign(syncer.object, result))
	}
}
