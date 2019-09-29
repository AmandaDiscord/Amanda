var ex = ex || []

{
	class DependencyLoader {
		constructor() {
			this.loaded = []
			this.items = []
		}

		addItem(item) {
			this.items.push(item)
			this.checkItems()
		}

		checkItems() {
			let somethingChanged = false
			do {
				somethingChanged = false
				this.items.forEach(item => {
					if (!this.loaded.includes(item.name) && item.dependencies.every(d => this.loaded.includes(d))) {
						console.log("%c[Loader]", "color: green", "Loading "+item.name)
						somethingChanged = true
						this.loaded.push(item.name)
						if (item.code) item.code()
					}
				})
			} while (somethingChanged)
		}
	}

	let loader = new DependencyLoader()

	for (let element of document.querySelectorAll("script[data-ex]")) {
		let exportName = element.getAttribute("data-ex")
		let exportObject = ex.find(e => e.name == exportName)
		if (exportObject) loader.addItem(exportObject)
		else element.addEventListener("load", () => {
			let exportObject = ex.find(e => e.name == exportName)
			loader.addItem(exportObject)
		})
	}
}