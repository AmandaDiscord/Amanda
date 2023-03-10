class ImageStore {
	constructor() {
		/** @type {Map<string, HTMLImageElement>} */
		this.store = new Map()
	}
	/** @param {string} url */
	_create(url) {
		let e = document.createElement("img")
		let host = typeof url === "string" ? new URL(url).host : undefined
		if (!["i.ytimg.com", "media.friskyradio.com"].includes(host)) e.crossOrigin = "anonymous"
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
		if (!url.length) return undefined
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
