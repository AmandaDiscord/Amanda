//@ts-check

const utils = require("../utilities.js")

class QueueManager {
	constructor() {
		this.store = new Map()
	}
	getOrCreate(field) {
		if (this.store.has(field)) return this.store.get(field)
		else return this.create(field)
	}
	create(field) {
		let result = new Queue()
		this.store.set(field, result)
		return field
	}
}

class Queue {
	constructor() {
		this.queue = []
		this.write = new utils.AsyncValueCache(() => this._write())
	}
	set(value) {
		console.log("set called with value", value)
		this.queue.unshift(value)
		console.log("queue is now", this.queue)
		if (this.queue.length == 1) this.write.get()
	}
	async _write() {
		console.log("writing!")
		// Empty queue
		let value = this.queue[0]
		this.queue = []
		// Write

		// We're done! Uncache self, and write again if there's already things queued.
		console.log("done writing!")
		this.write.clear()
		if (this.queue.length) {
			console.log("will call this.write again with queue", this.queue)
			this.write.get()
		}
	}
}

class PeriodicHistory {
	constructor(fields) {
		this.fields = fields

		this.store = new Map()
		this.fetching = true

		this.fetch = new utils.AsyncValueCache(async () => {
			let rows = await utils.sql.all("select field, count(*) as count from PeriodicHistory group by field")
			rows.forEach(row => {
				this.store.set(row.field, row.count)
			})
			this.fetching = false
			return rows
		})
		this.fetch.get()
	}

	add(field) {
		this.store.set(field, this.get(field)+1)

	}

	get(field) {
		if (this.fetching) console.error(`Attempted to access PeriodicHistory/${field} before first load! Continuing anyway.`)
		return this.store.get(field) || 0
	}
}

module.exports = PeriodicHistory
