class ImageStore {
	public store = new Map<string, HTMLImageElement>()

	private _create(url: string): HTMLImageElement {
		const e = document.createElement("img")
		const host = typeof url === "string" ? new URL(url).host : undefined
		if (!["i.ytimg.com", "media.friskyradio.com"].includes(host!)) e.crossOrigin = "anonymous"
		e.src = url
		return e
	}

	public add(url: string): HTMLImageElement | null {
		if (!this.store.has(url)) {
			const e = this._create(url)
			this.store.set(url, e)
			return e
		} else return null
	}

	public get(url: string): HTMLImageElement | null {
		if (!url.length) return null

		if (this.store.has(url)) {
			const e = this.store.get(url)
			this.store.delete(url)
			return e ?? null
		} else return this._create(url)
	}
}

const imageStore = new ImageStore()

export { imageStore }
