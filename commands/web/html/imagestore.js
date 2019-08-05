var ex = ex || []
ex.push({
	name: "imagestore",
	dependencies: []
})

class ImageStore {
	constructor() {
		this.store = new Map()
	}
	_create(url) {
		let e = document.createElement("img")
		e.src = url
		return e
	}
	add(url) {
		if (!this.store.has(url)) {
			let e = this._create(url)
			this.store.set(url, e)
			return e
		} else {
			return null
		}
	}
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
