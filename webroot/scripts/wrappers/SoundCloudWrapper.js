/// @ts-check

import {q} from "../utilities.js"

function createEmbedURL(link, props) {
	const url = new URL("https://w.soundcloud.com/player/")
	url.searchParams.append("url", link)
	Object.entries(props).forEach(([key, value]) => {
		url.searchParams.append(key, String(value))
	})
	return url.toString()
}

class SoundCloudWrapper {
	constructor() {
		this.frame = q("#f-soundcloud")
		this.controller = null
		this.ready = false
		this.seekers = new Set()
	}

	waitForReady() {
		if (this.ready) return Promise.resolve()
		else return new Promise(resolve => {
			console.log("cswait: ready is "+this.ready)
			this.controller.bind(SC.Widget.Events.READY, resolve)
		}).then(() => {
			this.ready = true
			console.log("cswait: resolved")
		})
	}

	async load(song) {
		this.seekers.clear()
		console.log("scload: reloading controller")
		const link = `https://api.soundcloud.com/tracks/${song.trackNumber}`
		const props = {auto_play: false, show_artwork: false, visual: false, callback: true}
		if (this.controller) {
			this.controller.unbind(SC.Widget.Events.READY)
			this.controller.unbind(SC.Widget.Events.PLAY_PROGRESS)
			this.controller.load(link, props)
		} else {
			this.frame.src = createEmbedURL(link, props)
			this.controller = new SC.Widget(this.frame)
		}
		this.ready = false
		this.waitForReady().then(() => {
			console.log("scload: waitForReady returned!")
		})
	}

	/**
	 * @param {() => number} timeGetter Function which gets the play time in ms.
	 * @param {number} songLength Length of the song in ms.
	 */
	async seekAndPlay(timeGetter, songLength) {
		console.log("scseekandplay: waiting")
		await this.waitForReady()
		this.seekers.clear() // cancel an ongoing seek
		const me = Symbol("SEEKER")
		this.seekers.add(me)
		this.controller.unbind(SC.Widget.Events.PLAY_PROGRESS)
		this.controller.setVolume(0)
		this.controller.seekTo(timeGetter())
		this.controller.play()
		console.log("scseekandplay: preparing")
		this.controller.bind(SC.Widget.Events.PLAY_PROGRESS, ({loadedProgress}) => { // generate a bunch of events telling us the loaded progress
			if (!this.seekers.has(me)) return
			const currentTime = timeGetter()
			const loadedTime = loadedProgress * songLength
			console.log(`scseekandplay: loading... c: ${currentTime}, l: ${loadedTime} (${loadedProgress}, ${songLength})`)
			if (loadedTime > currentTime) {
				console.log("scseekandplay: loaded enough")
				this.seekers.delete(me)
				this.controller.seekTo(currentTime)
				this.controller.setVolume(100)
				this.controller.unbind(SC.Widget.Events.PLAY_PROGRESS)
			}
		})
	}

	async resume() {
		await this.waitForReady()
		console.log("scresume: checking seekers")
		if (this.seekers.size) return // don't interfere with an ongoing seek
		console.log("scresume: calling play")
		this.controller.play()
	}

	async pause() {
		await this.waitForReady()
		this.seekers.clear() // cancel an ongoing seek
		this.controller.pause()
	}

	async stop() {
		await this.pause()
	}
}

export {
	SoundCloudWrapper
}
