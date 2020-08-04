// @ts-check

const Jimp = require("jimp")

const BitmapCache = require("./BitmapCache")

/** @extends {BitmapCache<import("@jimp/plugin-print").Font>} */
class FontCache extends BitmapCache {
	constructor() {
		super("font")
		/** @type {"font"} */
		this.type
	}
}

module.exports = FontCache
