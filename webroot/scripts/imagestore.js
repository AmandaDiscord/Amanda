class ImageStore {
	constructor() {
		/** @type {Map<string, HTMLImageElement>} */
		this.store = new Map()
	}
	/** @param {string} url */
	_create(url) {
		let e = document.createElement("img")
		if (typeof url === "string" && !(url.startsWith("https://i.ytimg.com") || url.includes("media.friskyradio.com"))) e.crossOrigin = "anonymous"
		e.src = url
		return e
	}
	/** @param {string} url */
	add(url) {
		if (!this.store.has(url)) {
			let e = this._create(url)
			this.store.set(url, e)
			return e
		} else {
			return null
		}
	}
	/** @param {string} url */
	get(url) {
		if (this.store.has(url)) {
			let e = this.store.get(url)
			this.store.delete(url)
			return e
		} else {
			return this._create(url)
		}
	}
}

const imageStore = new ImageStore()

export {
	imageStore
}
