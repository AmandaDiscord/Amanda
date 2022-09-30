// @ts-check

class Wrapper {
	constructor() {}
	async load(track) {}
	/**
	 * @param {() => number} timeGetter
	 * @param {number} trackLength
	 */
	async seekAndPlay(timeGetter, trackLength) {}
	async resume() {}
	async pause() {}
	async stop() {}
}

export {
	Wrapper
}
