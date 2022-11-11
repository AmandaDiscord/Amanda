class SingleUseMap<K, V> extends Map<K, V> {
	public use(key: K) {
		const value = this.get(key)
		this.delete(key)
		return value
	}
}

export { SingleUseMap }
