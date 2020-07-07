// @ts-check

const Jimp = require("jimp")
const JimpPrototype = Jimp.prototype

const BitmapCache = require("./BitmapCache")

/** @extends {BitmapCache<typeof JimpPrototype>} */
class ImageCache extends BitmapCache {
	constructor() {
		super()
	}
	/**
	 * @param {string} name
	 * @param {string} path
	 */
	save(name, path) {
		const promise = Jimp.read(path)
		this.savePromise(name, promise)
	}
}

module.exports = ImageCache
