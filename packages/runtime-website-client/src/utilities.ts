export function q<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K] | null
export function q<K extends keyof SVGElementTagNameMap>(selectors: K): SVGElementTagNameMap[K] | null
export function q<K extends keyof MathMLElementTagNameMap>(selectors: K): MathMLElementTagNameMap[K] | null
export function q<E extends Element>(selectors: string): E | null
export function q(s: string) {
	return document.querySelector(s)
}

export const opcodes = {
	IDENTIFY: 1,
	ACKNOWLEDGE: 2,
	STATE: 3,
	TRACK_ADD: 4,
	TRACK_REMOVE: 5,
	TRACK_UPDATE: 6,
	NEXT: 7,
	TIME_UPDATE: 8,
	TOGGLE_PLAYBACK: 9,
	SKIP: 10,
	STOP: 11,
	ATTRIBUTES_CHANGE: 12,
	CLEAR_QUEUE: 13,
	LISTENERS_UPDATE: 14,
	TRACK_PLAY_NOW: 15,
	SEEK: 16
}

function* generator() {
	let i = 0
	while (true) {
		yield ++i
	}
}

export let generateNonce: () => number
{
	const genInstance = generator()
	generateNonce = () => genInstance.next().value!
}

export function prettySeconds(seconds: number) {
	if (isNaN(seconds)) return String(seconds)
	let minutes = Math.floor(seconds / 60)
	seconds = seconds % 60
	const hours = Math.floor(minutes / 60)
	minutes = minutes % 60
	const output: Array<string> = []
	if (hours) {
		output.push(hours.toString())
		output.push(minutes.toString().padStart(2, "0"))
	} else output.push(minutes.toString())
	output.push(seconds.toString().padStart(2, "0"))
	return output.join(":")
}
