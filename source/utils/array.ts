/**
 * Get a random element from an array.
 */
export function random<T>(array: Array<T>) {
	const index = Math.floor(Math.random() * array.length)
	return array[index]
}

/**
 * Shuffle an array in place. https://stackoverflow.com/a/12646864
 */
export function shuffle<T extends Array<unknown>>(array: T) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]]
	}
	return array
}

export default exports as typeof import("./array")
