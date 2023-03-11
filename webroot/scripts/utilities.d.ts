export const q: (s: string) => HTMLElement | null

export enum opcodes {
	IDENTIFY = 1,
	ACKNOWLEDGE,
	STATE,
	TRACK_ADD,
	TRACK_REMOVE,
	TRACK_UPDATE,
	NEXT,
	TIME_UPDATE,
	TOGGLE_PLAYBACK,
	SKIP,
	STOP,
	ATTRIBUTES_CHANGE,
	CLEAR_QUEUE,
	LISTENERS_UPDATE,
}

export const generateNonce: () => number

export function prettySeconds(seconds: number): string
