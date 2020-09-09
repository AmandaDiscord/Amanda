// @ts-check

const passthrough = require("../../passthrough")
const { client, config } = passthrough

/** @type {Map<string, { threadID: string, callback: (data) => any }>} */
const threads = new Map()

class CacheQueueManager {
	constructor() {
		this.threads = threads
		this.lastThreadID = 0
	}
	/**
	 * @param {import("../../typings").InboundData} data
	 */
	onMessage(data) {
		if (data.threadID) {
			const thread = threads.get(data.threadID)
			if (thread) {
				thread.callback(data.data)
			}
		}
	}
	nextThreadID() {
		return `${process.pid}_${(++this.lastThreadID)}`
	}
	/**
	 * @template {keyof import("../../typings").CacheOperations} E
	 * @param {E} op
	 * @param {import("../../typings").CacheOperations[E]} params
	 * @param {number} [timeout=15000]
	 */
	request(op, params, timeout = 15000) {
		const threadID = this.nextThreadID()
		/** @type {import("../../typings").ActionEvents["CACHE_REQUEST_DATA"]} */
		const request = {
			threadID,
			op,
			params
		}

		/** @type {import("../../typings").ActionRequestData<"CACHE_REQUEST_DATA">} */
		const payload = {
			event: "CACHE_REQUEST_DATA",
			data: request,
			time: new Date().toUTCString(),
			cluster: config.cluster_id
		}

		const promise = new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				threads.delete(threadID)
				reject(new Error(`Thread ran out of time for ${op}`))
			}, timeout)
			threads.set(threadID, { threadID, callback: (d) => {
				clearTimeout(timer)
				threads.delete(threadID)
				resolve(d)
			} })
		})

		client.connector.channel.sendToQueue(config.amqp_client_request_queue, Buffer.from(JSON.stringify(payload)))

		return promise
	}
}

module.exports = CacheQueueManager
