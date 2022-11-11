class StreakManager {
	public streaks = new Map<string, { id: string; amount: number; timeout: NodeJS.Timeout | null }>()
	public config = new Map<string, { hold: number }>()

	/**
	 * For `info.maxMult`: Mutiply the max by this number to get a "new max" to clamp to.
	 *
	 * For `info.multStep`: How much more should be added to the original calculated amount multiplied by how many steps it took to get to the clamped max. (original + (stepsTaken * info.multStep))
	 *
	 * For `info.absolute`: The ABSOLUTE max amount `info.maxMult` can clamp to
	 */
	public calculate(info: { max: number; step: number; pkey: string; skey: string; maxMult?: number; multStep?: number; absolute?: number }, autoIncrement = false) {
		const data = this.streaks.get(`${info.pkey}-${info.skey}`)
		if (!data) return this.create(info.pkey, info.skey)
		if (autoIncrement) this.increment(info.pkey, info.skey)
		const original = info.step * (data.amount >= info.max ? info.max : data.amount)
		if (info.maxMult && info.multStep && data.amount >= (info.max * info.maxMult)) {
			return original + (Math.floor(Math.log10(data.amount > (info.absolute || Infinity) ? (info.absolute || 0) : data.amount)) * info.multStep) - info.multStep
		} else return original
	}

	public create(pkey: string, skey: string) {
		const timeout = this.getDestroyDuration(skey)
		this.streaks.set(`${pkey}-${skey}`, { id: pkey, amount: 0, timeout: timeout ? setTimeout(() => this.delete(pkey, skey), timeout) : null })
		return 0
	}

	public getStreak(pkey: string, skey: string) {
		const data = this.streaks.get(`${pkey}-${skey}`)
		if (!data) return this.create(pkey, skey)
		else return data.amount
	}

	/**
	 * Increments a streak amount. returns 0 if no data existed (data will be automatically created) and the incremented amount if there is existing data
	 */
	public increment(pkey: string, skey: string) {
		const data = this.streaks.get(`${pkey}-${skey}`)
		if (!data) return this.create(pkey, skey)
		data.amount++
		if (data.timeout) {
			const timeout = this.getDestroyDuration(skey)
			clearTimeout(data.timeout)
			data.timeout = timeout ? setTimeout(() => this.delete(pkey, skey), timeout) : null
		}
		return data.amount + 1
	}

	public delete(pkey: string, skey: string) {
		return this.streaks.delete(`${pkey}-${skey}`)
	}

	/**
	 * @param duration The duration in ms (0 for no destruction). Defaults to 0
	 */
	public setConfig(skey: string, duration = 0) {
		this.config.set(skey, { hold: duration })
	}

	public getDestroyDuration(skey: string) {
		return this.config.get(skey)?.hold || 0
	}
}

export { StreakManager }
