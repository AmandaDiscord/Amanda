// @ts-check

const Jimp = require("jimp")

const BitmapCache = require("./BitmapCache")

/** @extends {BitmapCache<import("@jimp/plugin-print").Font>} */
class FontCache extends BitmapCache {
	constructor() {
		super()
	}
	/**
	 * @param {string} name
	 * @param {string} path
	 */
	save(name, path) {
		const promise = Jimp.loadFont(path)
		this.savePromise(name, promise)
	}
}

module.exports = FontCache
