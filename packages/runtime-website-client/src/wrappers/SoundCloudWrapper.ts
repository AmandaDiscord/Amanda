/* eslint-disable no-undef */
import { q } from "../utilities.js"

import "../global.js"
import type { Wrapper } from "./interface.js"

// import type { Track as WebTrack } from "../../../runtime-website/src/music/tracktypes"
type WebTrack = any

function createEmbedURL(link: string, props: Record<string, unknown>): string {
	const url = new URL("https://w.soundcloud.com/player/")
	url.searchParams.append("url", link)
	Object.entries(props).forEach(([key, value]) => {
		url.searchParams.append(key, String(value))
	})
	return url.toString()
}

export class SoundCloudWrapper implements Wrapper {
	public readonly frame = q<HTMLIFrameElement>("#f-soundcloud")
	public controller: typeof SC.Widget.prototype | null = null
	public ready = false
	public readonly seekers = new Set<symbol>()

	public async waitForReady(): Promise<void> {
		if (this.ready) return
		if (!this.controller) throw new Error("SoundCloud controller is not initialized. load() must succeed first.")
		await new Promise<void>(resolve => {
			this.controller!.bind(SC.Widget.Events.READY, () => resolve())
		})
		this.ready = true
	}

	public async load(track: ReturnType<WebTrack["toObject"]>): Promise<void> {
		this.seekers.clear()
		if (!track.uri) throw new Error("Track has no URI to load into the SoundCloud widget")
		const link = track.uri
		const props = { auto_play: false, show_artwork: false, visual: false, callback: true }

		if (this.controller) {
			this.controller.unbind(SC.Widget.Events.READY)
			this.controller.unbind(SC.Widget.Events.PLAY_PROGRESS)
			this.controller.load(link, props)
		} else {
			if (!this.frame) throw new Error("No SoundCloud iframe element found")
			this.frame.src = createEmbedURL(link, props)
			this.controller = new SC.Widget(this.frame)
		}

		this.ready = false
		await this.waitForReady()
	}

	public async seekAndPlay(timeGetter: () => number, trackLength: number): Promise<void> {
		await this.waitForReady()

		this.seekers.clear() // cancel an ongoing seek
		const me = Symbol("SEEKER")
		this.seekers.add(me)
		this.controller!.unbind(SC.Widget.Events.PLAY_PROGRESS)
		this.controller!.setVolume(0)
		this.controller!.seekTo(timeGetter())
		this.controller!.play()
		this.controller!.bind(SC.Widget.Events.PLAY_PROGRESS, data => { // generate a bunch of events telling us the loaded progress
			if (!this.seekers.has(me)) return
			const currentTime = timeGetter()
			const loadedTime = data.loadProgress * trackLength
			if (loadedTime > currentTime) {
				this.seekers.delete(me)
				this.controller!.seekTo(currentTime)
				this.controller!.setVolume(100)
				this.controller!.unbind(SC.Widget.Events.PLAY_PROGRESS)
			}
		})
	}

	public async resume(): Promise<void> {
		await this.waitForReady()
		if (this.seekers.size) return // don't interfere with an ongoing seek
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
