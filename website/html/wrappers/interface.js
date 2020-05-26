// @ts-check

class Wrapper {
	constructor() {}
	async load(song) {}
	/**
	 * @param {() => number} timeGetter
	 * @param {number} songLength
	 */
	async seekAndPlay(timeGetter, songLength) {}
	async resume() {}
	async pause() {}
	async stop() {}
}

export {
	Wrapper
}
