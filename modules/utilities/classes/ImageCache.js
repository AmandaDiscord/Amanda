// @ts-check

const Jimp = require("jimp")
const JimpPrototype = Jimp.prototype

const BitmapCache = require("./BitmapCache")

/** @extends {BitmapCache<typeof JimpPrototype>} */
class ImageCache extends BitmapCache {
	constructor() {
		super("image")
		/** @type {"image"} */
		this.type
	}
}

module.exports = ImageCache
