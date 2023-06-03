import { q } from "../utilities.js"

import "../global.js"
import type { Wrapper } from "./interface.js"

// import type { Track as WebTrack } from "../../../runtime-website/src/music/tracktypes"

function createEmbedURL(link: string, props: Record<string, unknown>): string {
	const url = new URL("https://w.soundcloud.com/player/")
	url.searchParams.append("url", link)
	Object.entries(props).forEach(([key, value]) => {
		url.searchParams.append(key, String(value))
	})
	return url.toString()
}

export class SoundCloudWrapper implements Wrapper {
	public frame = q<HTMLIFrameElement>("#f-soundcloud")
	public controller: typeof SC.Widget.prototype | null = null
	public ready = false
	public seekers = new Set<symbol>()

	public async waitForReady(): Promise<void> {
		if (this.ready) return Promise.resolve()
		else {
			if (!this.controller) return console.log("No controller")
			await new Promise(resolve => {
				console.log("cswait: ready is " + this.ready)
				this.controller!.bind(SC.Widget.Events.READY, resolve)
			})
		}
		this.ready = true
		console.log("cswait: resolved")
	}

	public async load(/* track: ReturnType<WebTrack["toObject"]>*/): Promise<void> {
		this.seekers.clear()
		console.log("scload: reloading controller")
		const trackNumber = 301157784
		const link = `https://api.soundcloud.com/tracks/${trackNumber}`
		const props = { auto_play: false, show_artwork: false, visual: false, callback: true }

		if (this.controller) {
			this.controller.unbind(SC.Widget.Events.READY)
			this.controller.unbind(SC.Widget.Events.PLAY_PROGRESS)
			this.controller.load(link, props)
		} else {
			if (!this.frame) return console.log("No frame")
			this.frame.src = createEmbedURL(link, props)
			this.controller = new SC.Widget(this.frame)
		}

		this.ready = false
		await this.waitForReady().then(() => {
			console.log("scload: waitForReady returned!")
		})
	}

	public async seekAndPlay(timeGetter: () => number, trackLength: number): Promise<void> {
		console.log("scseekandplay: waiting")
		await this.waitForReady()

		this.seekers.clear() // cancel an ongoing seek
		const me = Symbol("SEEKER")
		this.seekers.add(me)
		this.controller!.unbind(SC.Widget.Events.PLAY_PROGRESS)
		this.controller!.setVolume(0)
		this.controller!.seekTo(timeGetter())
		this.controller!.play()
		console.log("scseekandplay: preparing")
		this.controller!.bind(SC.Widget.Events.PLAY_PROGRESS, data => { // generate a bunch of events telling us the loaded progress
			console.log(data)
			if (!this.seekers.has(me)) return
			const currentTime = timeGetter()
			const loadedTime = data.loadProgress * trackLength
			console.log(`scseekandplay: loading... c: ${currentTime}, l: ${loadedTime} (${data.loadProgress}, ${trackLength})`)
			if (loadedTime > currentTime) {
				console.log("scseekandplay: loaded enough")
				this.seekers.delete(me)
				this.controller!.seekTo(currentTime)
				this.controller!.setVolume(100)
				this.controller!.unbind(SC.Widget.Events.PLAY_PROGRESS)
			}
		})
	}

	public async resume(): Promise<void> {
		await this.waitForReady()
		console.log("scresume: checking seekers")
		if (this.seekers.size) return // don't interfere with an ongoing seek
		console.log("scresume: calling play")
		this.controller!.play()
	}

	public async pause(): Promise<void> {
		await this.waitForReady()
		this.seekers.clear() // cancel an ongoing seek
		this.controller!.pause()
	}

	public async stop(): Promise<void> {
		await this.pause()
	}
}
