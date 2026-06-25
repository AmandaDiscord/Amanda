class ImageStore {
	public readonly store = new Map<string, HTMLImageElement>()

	private _create(url: string): HTMLImageElement {
		const e = document.createElement("img")
		e.src = url
		return e
	}

	public add(url: string): HTMLImageElement | null {
		if (this.store.has(url)) return null
		else {
			const e = this._create(url)
			this.store.set(url, e)
			return e
		}
	}

	public get(url: string): HTMLImageElement | null {
		if (!url.length) return null

		if (this.store.has(url)) {
			return this.store.get(url) ?? null
		} else return this._create(url)
	}
}

const imageStore = new ImageStore()

export { imageStore }
