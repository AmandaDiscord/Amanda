import Jimp = require("jimp")

class BitmapCache<K, T extends "image" | "font"> {
	public type: T
	public store = new Map<string, string>()

	public constructor(type: T) {
		this.type = type
	}

	public save(name: string, dir: string) {
		this.store.set(name, dir)
	}


	async get(name: string): Promise<K> {
		const dir = this.store.get(name)!
		let value: K
		if (this.type == "image") value = await Jimp.read(dir) as K
		else if (this.type == "font") value = await Jimp.loadFont(dir) as K
		else throw new Error("INVALID_TYPE")
		return value
	}

	/**
	 * @param {N} names
	 * @returns {Promise<Map<N extends Array<infer P> ? P : N, T>>}
	 * @template {Array<any>} N
	 */
	async getAll<N extends Array<string>>(names: N): Promise<Map<N extends Array<infer P> ? P : N, K>> {
		const result = new Map()
		await Promise.all(names.map(name => this.get(name).then(value => result.set(name, value))))
		return result
	}
}

export { BitmapCache }
