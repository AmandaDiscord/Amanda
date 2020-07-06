// @ts-check

/**
 * @template T
 */
class BitmapCache {
	constructor() {
		/**
		 * @type {Map<string, T | Promise<T>>}
		 */
		this.store = new Map()
	}

	/**
	 * @param {string} name
	 * @param {Promise<T>} promise
	 */
	savePromise(name, promise) {
		this.store.set(name, promise)
		promise.then(result => {
			this.store.set(name, result)
		})
	}

	/**
	 * @param {string} name
	 * @returns {Promise<T>}
	 */
	get(name) {
		const value = this.store.get(name)
		if (value instanceof Promise) return value
		else return Promise.resolve(value)
	}

	/**
	 * @param {Array<string>} names
	 * @returns {Promise<Map<string, T>>}
	 */
	async getAll(names) {
		const result = new Map()
		await Promise.all(names.map(name => this.get(name).then(value => result.set(name, value))))
		return result
	}
}

module.exports = BitmapCache
