import { BitmapCache } from "./BitmapCache"

class ImageCache extends BitmapCache<import("jimp"), "image"> {
	constructor() {
		super("image")
	}
}

export { ImageCache }
