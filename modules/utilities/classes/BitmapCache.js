// @ts-check

const Jimp = require("jimp")
/**
 * @template T
 */
class BitmapCache {
	/**
	 * @param {"image" | "font"} type
	 */
	constructor(type) {
		this.type = type
		/**
		 * @type {Map<string, string>}
		 */
		this.store = new Map()
	}

	/**
	 * @param {string} name
	 * @param {string} dir
	 */
	save(name, dir) {
		this.store.set(name, dir)
	}

	/**
	 * @param {string} name
	 * @returns {Promise<T>}
	 */
	async get(name) {
		const dir = this.store.get(name)
		let value
		if (this.type == "image") {
			value = await Jimp.read(dir)
		} else if (this.type == "font") {
			value = await Jimp.loadFont(dir)
		}
		// @ts-ignore
		return value
	}

	/**
	 * @param {N} names
	 * @returns {Promise<Map<N extends Array<infer P> ? P : N, T>>}
	 * @template {Array<any>} N
	 */
	async getAll(names) {
		const result = new Map()
		await Promise.all(names.map(name => this.get(name).then(value => result.set(name, value))))
		return result
	}
}

module.exports = BitmapCache
