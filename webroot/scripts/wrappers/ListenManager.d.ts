export class ListenManager {
	public currentWrapper: import("./interface").Wrapper | null
	public wrappers: { soundCloudWrapper: import("./SoundCloudWrapper").SoundCloudWrapper }
	public enabled: boolean

	/** When the button is clicked and we need to connect to a still playing track. */
	public boot(track: ReturnType<import("../../../source/music/tracktypes").Track["toObject"]>, timeGetter: () => number): void
	/** Load a new track, but don't play it yet. For when a session is started and the queue state is reset. */
	public load(track: ReturnType<import("../../../source/music/tracktypes").Track["toObject"]>): void
	public next(track: ReturnType<import("../../../source/music/tracktypes").Track["toObject"]>): Promise<void>
	public pause(): void
	public resume(): void
	public stop(): void

	private _selectWrapper(track: ReturnType<import("../../../source/music/tracktypes").Track["toObject"]>): void
}
