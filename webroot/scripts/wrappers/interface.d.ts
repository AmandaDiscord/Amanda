export class Wrapper {
	load(track: ReturnType<import("../../../source/music/tracktypes").Track["toObject"]>): Promise<void>
	seekAndPlay(timeGetter: () => number, trackLength: number): Promise<void>
	resume(): Promise<void>
	pause(): Promise<void>
	stop(): Promise<void>
}
