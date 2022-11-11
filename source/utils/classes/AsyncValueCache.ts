class AsyncValueCache<T> {
	public getter: () => Promise<T>
	public lifetime: number | undefined
	public lifetimeTimeout: NodeJS.Timeout | null = null
	public promise: Promise<T> | null = null
	public cache: T | null = null

	public constructor(getter: () => Promise<T>, lifetime: number | undefined = undefined) {
		this.getter = getter
		this.lifetime = lifetime
	}

	public clear() {
		if (this.lifetimeTimeout) clearTimeout(this.lifetimeTimeout)
		this.cache = null
	}

	public get() {
		if (this.cache) return Promise.resolve(this.cache)
		if (this.promise) return this.promise
		return this._getNew()
	}

	private async _getNew() {
		this.promise = this.getter()
		const result = await this.promise
		this.cache = result
		this.promise = null
		if (this.lifetimeTimeout) clearTimeout(this.lifetimeTimeout)
		if (this.lifetime) this.lifetimeTimeout = setTimeout(() => this.clear(), this.lifetime)
		return result
	}
}

export { AsyncValueCache }
