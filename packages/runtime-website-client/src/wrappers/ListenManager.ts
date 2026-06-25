import type { Wrapper } from "./interface"

import { SoundCloudWrapper } from "./SoundCloudWrapper.js"

import type { Track as WebTrack } from "../../../runtime-website/src/music/tracktypes"

type WebTrackJSON = ReturnType<WebTrack["toObject"]>

export class ListenManager {
	public currentWrapper: Wrapper | null = null
	public readonly wrappers = { soundCloudWrapper: new SoundCloudWrapper() }
	public enabled = false

	public async boot(track: WebTrackJSON, timeGetter: () => number): Promise<void> {
		this.enabled = true
		this._selectWrapper(track)
		if (!this.currentWrapper) return
		await this.currentWrapper.load(track)
		await this.currentWrapper.seekAndPlay(timeGetter, track.length * 1000)
	}

	public async load(track: WebTrackJSON): Promise<void> {
		if (!this.enabled) return
		await this.stop()
		this._selectWrapper(track)
		if (!this.currentWrapper) return
		await this.currentWrapper.load(track)
	}

	public async next(track: WebTrackJSON): Promise<void> {
		if (!this.enabled) return
		if (this.currentWrapper) await this.currentWrapper.stop()
		this._selectWrapper(track)
		if (this.currentWrapper) {
			await this.currentWrapper.load(track)
			await this.currentWrapper.resume()
		}
	}

	public async pause(): Promise<void> {
		if (!this.currentWrapper) return
		await this.currentWrapper.pause()
	}

	public async resume(): Promise<void> {
		if (!this.currentWrapper) return
		await this.currentWrapper.resume()
	}

	public async stop(): Promise<void> {
		if (!this.currentWrapper) return
		await this.currentWrapper.stop()
		this.currentWrapper = null
	}

	private _selectWrapper(track: WebTrackJSON): void {
		if (track.source === "soundcloud") this.currentWrapper = this.wrappers.soundCloudWrapper
		else this.currentWrapper = null
	}
}
