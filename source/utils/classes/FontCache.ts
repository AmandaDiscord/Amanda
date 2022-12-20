import { BitmapCache } from "./BitmapCache"

class FontCache extends BitmapCache<import("@jimp/plugin-print").Font, "font"> {
	constructor() {
		super("font")
	}
}

export = { FontCache }
