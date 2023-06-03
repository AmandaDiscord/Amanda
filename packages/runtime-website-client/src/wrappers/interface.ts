import type { Track as WebTrack } from "../../../runtime-website/src/music/tracktypes"

export abstract class Wrapper {
	abstract load(track: ReturnType<WebTrack["toObject"]>): Promise<void>
	abstract seekAndPlay(timeGetter: () => number, trackLength: number): Promise<void>
	abstract resume(): Promise<void>
	abstract pause(): Promise<void>
	abstract stop(): Promise<void>
}
