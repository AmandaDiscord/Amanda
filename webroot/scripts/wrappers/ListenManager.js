// @ts-check

import {SoundCloudWrapper} from "./SoundCloudWrapper.js"

class ListenManager {
	constructor() {
		/** @type {import("./interface").Wrapper} */
		this.currentWrapper = null
		this.wrappers = {
			soundCloudWrapper: new SoundCloudWrapper()
		}
		this.enabled = false // set to true in boot method
	}

	/**
	 * When the button is clicked and we need to connect to a still playing track.
	 * @param {() => number} timeGetter Function which gets the play time in ms.
	 */
	boot(track, timeGetter) {
		this.enabled = true
		this._selectWrapper(track)
		this.currentWrapper.load(track)
		this.currentWrapper.seekAndPlay(timeGetter, track.length * 1000)
	}

	/**
	 * Load a new track, but don't play it yet. For when a session is started and the queue state is reset.
	 */
	load(track) {
		if (!this.enabled) return
		this.stop()
		this._selectWrapper(track)
		this.currentWrapper.load(track)
	}

	async next(track) {
		if (!this.enabled) return
		console.log("next: calling stop")
		if (this.currentWrapper) await this.currentWrapper.stop()
		console.log("next: selecting wrapper")
		this._selectWrapper(track)
		if (this.currentWrapper) {
			console.log("next: loading")
			await this.currentWrapper.load(track)
			console.log("next: resuming")
			await this.currentWrapper.resume()
		}
	}

	pause() {
		if (!this.currentWrapper) return
		this.currentWrapper.pause()
	}

	resume() {
		if (!this.currentWrapper) return
		this.currentWrapper.resume()
	}

	stop() {
		if (!this.currentWrapper) return
		this.currentWrapper.stop()
		this.currentWrapper = null
	}

	_selectWrapper(track) {
		if (track.source === "soundcloud") {
			this.currentWrapper = this.wrappers.soundCloudWrapper
		} else {
			this.currentWrapper = null
		}
	}
}

export {
	ListenManager
}
