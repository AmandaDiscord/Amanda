// @ts-check

/** @template T */
class AsyncValueCache {
	/**
	 * @param {() => Promise<T>} getter
	 * @param {number} lifetime
	 */
	constructor(getter, lifetime = undefined) {
		this.getter = getter
		this.lifetime = lifetime
		this.lifetimeTimeout = null
		/** @type {Promise<T>} */
		this.promise = null
		/** @type {T} */
		this.cache = null
	}

	clear() {
		clearTimeout(this.lifetimeTimeout)
		this.cache = null
	}

	get() {
		if (this.cache) return Promise.resolve(this.cache)
		if (this.promise) return this.promise
		return this._getNew()
	}

	_getNew() {
		this.promise = this.getter()
		return this.promise.then(result => {
			this.cache = result
			this.promise = null
			clearTimeout(this.lifetimeTimeout)
			if (this.lifetime) this.lifetimeTimeout = setTimeout(() => this.clear(), this.lifetime)
			return result
		})
	}
}

module.exports = AsyncValueCache
