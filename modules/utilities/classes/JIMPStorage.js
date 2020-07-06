// @ts-check

const Jimp = require("jimp")

/**
 * @template T
 */
class JIMPStorage {
	constructor() {
		/**
		 * @type {Map<string, T>}
		 */
		this.store = new Map()
	}
	/**
	 * @param {string} name
	 * @param {"file"|"font"} type
	 * @param {string} value
	 */
	save(name, type, value) {
		if (type == "file") {
			const promise = Jimp.read(value)
			// @ts-ignore
			this.savePromise(name, promise)
		} else if (type == "font") {
			const promise = Jimp.loadFont(value)
			// @ts-ignore
			this.savePromise(name, promise)
		}
	}

	/**
	 * @param {string} name
	 * @param {Promise<T>} promise
	 */
	savePromise(name, promise) {
		// @ts-ignore
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

module.exports = JIMPStorage
