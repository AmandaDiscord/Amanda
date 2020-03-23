// @ts-check

const utils = require("../utilities.js")

class Queue {
	/**
	 * @param {number} ttl
	 */
	constructor(ttl) {
		this.ttl = ttl
		this.items = []
	}

	/**
	 * Add to the queue. (Doesn't affect database.)
	 * @param {number} [timestamp]
	 */
	add(timestamp) {
		if (!timestamp) timestamp = Date.now()
		else if (Date.now() - timestamp > this.ttl) return
		this.items.push(timestamp)
	}

	sweep() {
		const currentTime = Date.now()
		const oldLength = this.items.length
		this.items = this.items.filter(i => currentTime - i < this.ttl)
		return oldLength - this.items.length
	}

	size() {
		this.sweep()
		return this.items.length
	}
}

class PeriodicHistory {
	/**
	 * @param {{field: string, ttl: number}[]} fields
	 * @param {number} defaultTtl
	 */
	constructor(fields, defaultTtl = 86400000) {
		this.defaultTtl = defaultTtl

		/** @type {Map<string, Queue>} */
		this.store = new Map()
		this.fetching = true

		fields.forEach(field => {
			this.store.set(field.field, new Queue(field.ttl))
		})

		this.fetch = new utils.AsyncValueCache(async () => {
			const rows = await utils.sql.all("SELECT field, timestamp FROM PeriodicHistory")
			// TODO: also sweep the database
			rows.forEach(row => {
				const queue = this.getOrCreate(row.field)
				queue.add(row.timestamp)
			})
			this.fetching = false
			this.sweep(true)
			return rows
		})
		this.fetch.get()

		// Periodically sweep out old entries
		setInterval(() => {
			this.sweep()
		}, 300e3) // 5 minutes
	}

	/**
	 * Add to the queue and send to the database.
	 * @param {string} field
	 * @param {number} [timestamp]
	 */
	add(field, timestamp) {
		const queue = this.getOrCreate(field)
		queue.add(timestamp)
		return utils.sql.all("insert into PeriodicHistory (field, timestamp) values (?, ?)", [field, Date.now()])
	}

	/**
	 * @param {string} field
	 * @returns {Queue}
	 */
	getOrCreate(field) {
		if (this.store.has(field)) return this.store.get(field)
		else {
			console.error(`Creating a new PeriodicHistory/${field}! You probably don't want to do this.`)
			const queue = new Queue(this.defaultTtl)
			this.store.set(field, queue)
			return queue
		}
	}

	/**
	 * @param {string} field
	 * @returns {number}
	 */
	getSize(field) {
		return this.getOrCreate(field).size()
	}

	/**
	 * Sweep each queue, and if items were removed, also delete from the database.
	 */
	sweep(force = false) {
		for (const field of this.store.keys()) {
			const queue = this.store.get(field)
			const removed = queue.sweep()
			if (removed || force) utils.sql.all("DELETE FROM PeriodicHistory WHERE field = ? AND timestamp < ?", [field, Date.now() - queue.ttl])
		}
	}
}

module.exports = PeriodicHistory
