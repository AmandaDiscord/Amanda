class SingleUseMap extends Map {
	constructor() {
		super()
	}

	use(key) {
		const value = this.get(key)
		this.delete(key)
		return value
	}
}

module.exports = SingleUseMap
