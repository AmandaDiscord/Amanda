// @ts-check

/**
 * Get a random element from an array.
 * @param {Array<T>} array
 * @return {T}
 * @template T
 */
function random(array) {
	const index = Math.floor(Math.random() * array.length)
	return array[index]
}
/**
 * Shuffle an array in place. https://stackoverflow.com/a/12646864
 * @param {Array<T>} array
 * @return {Array<T>}
 * @template T
 */
function shuffle(array) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]]
	}
	return array
}

module.exports.random = random
module.exports.shuffle = shuffle
