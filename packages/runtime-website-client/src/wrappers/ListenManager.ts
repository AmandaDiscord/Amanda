import type { Wrapper } from "./interface"

import { SoundCloudWrapper } from "./SoundCloudWrapper.js"

import type { Track as WebTrack } from "../../../runtime-website/src/music/tracktypes"

export class ListenManager {
	public currentWrapper: Wrapper | null = null
	public wrappers = { soundCloudWrapper: new SoundCloudWrapper() }
	public enabled = false

	public boot(track: ReturnType<WebTrack["toObject"]>, timeGetter: () => number): void {
		this.enabled = true
		this._selectWrapper(track)
		if (!this.currentWrapper) return
		this.currentWrapper.load(track).catch(() => void 0)
		this.currentWrapper.seekAndPlay(timeGetter, track.length * 1000).catch(() => void 0)
	}

	public load(track: ReturnType<WebTrack["toObject"]>): void {
		if (!this.enabled) return
		this.stop()
		this._selectWrapper(track)
		if (!this.currentWrapper) return
		this.currentWrapper.load(track).catch(() => void 0)
	}

	public async next(track: ReturnType<WebTrack["toObject"]>): Promise<void> {
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

	public pause(): void {
		if (!this.currentWrapper) return
		this.currentWrapper.pause().catch(() => void 0)
	}

	public resume(): void {
		if (!this.currentWrapper) return
		this.currentWrapper.resume().catch(() => void 0)
	}

	public stop(): void {
		if (!this.currentWrapper) return
		this.currentWrapper.stop().catch(() => void 0)
		this.currentWrapper = null
	}

	private _selectWrapper(track: ReturnType<WebTrack["toObject"]>): void {
		if (track.source === "soundcloud") this.currentWrapper = this.wrappers.soundCloudWrapper
		else this.currentWrapper = null
	}
}
