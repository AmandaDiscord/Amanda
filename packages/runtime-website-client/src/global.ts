declare class Widget {
	public static Events: {
		LOAD_PROGRESS: "loadProgress",
		PLAY_PROGRESS: "playProgress",
		PLAY: "play",
		CLICK_BUY: "buyClicked",
		CLICK_DOWNLOAD: "downloadClicked",
		ERROR: "error",
		FINISH: "finish",
		OPEN_SHARE_PANEL: "sharePanelOpened",
		PAUSE: "pause",
		READY: "ready",
		SEEK: "seek"
	}

	public constructor(frame: string | HTMLIFrameElement, url?: string, query?: Array<string>)

	public bind<E extends typeof Widget.Events[keyof typeof Widget.Events]>(
		eventName: E,
		listener: (data: E extends AudioEvents ? { relativePosition: number; loadProgress: number; currentPosition: number } : undefined) => void
	): void
	public unbind(eventName: typeof Widget.Events[keyof typeof Widget.Events]): void
	public load(url: string, options?: {
		auto_play?: boolean;
		color?: string;
		buying?: boolean;
		sharing?: boolean;
		download?: boolean;
		show_artwork?: boolean;
		show_playcount?: boolean;
		show_user?: boolean;
		start_track?: number;
		single_active?: boolean;
	}): void
	public play(): void
	public pause(): void
	public toggle(): void
	public seekTo(ms: number): void
	public setVolume(percent: number): void
	public next(): void
	public prev(): void
	public skip(soundIndex: number): void

	public getVolume(callback: (value: number) => unknown): this
	public getDuration(callback: (value: number) => unknown): this
	public getPosition(callback: (value: number) => unknown): this
	public getSounds(callback: (value: Array<unknown>) => unknown): this
	public getCurrentSound(callback: (value: unknown) => unknown): this
	public getCurrentSoundIndex(callback: (value: number) => unknown): this
	public isPaused(callback: (value: boolean) => unknown): this
}

declare type AudioEvents = typeof Widget.Events.LOAD_PROGRESS
	| typeof Widget.Events.PLAY_PROGRESS
	| typeof Widget.Events.PLAY
	| typeof Widget.Events.PAUSE
	| typeof Widget.Events.FINISH
	| typeof Widget.Events.SEEK

declare global {
	const SC: {
		Widget: typeof Widget
	}
	const _serverTimeDiff: number
	const _channelID: string
	interface HTMLElement {
		js?: import("./classes").ElemJS<HTMLElement>
	}
	interface Window {
		session: import("./player").Session
	}
}
export {}
