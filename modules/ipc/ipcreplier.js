// @ts-check

const types = require("../../typings")

class SingleUseMap extends Map {
	constructor() {
		super()
	}

	use(key) {
		const value = this.get(key)
		this.delete(key)
		return value
	}
}

/**
 * Keywords:
 * - RECEIVE: an unthreaded message has come in, act on it and don't reply (because we can't reply)
 * - REPLY: a message has come in, act on it and send a reply to that thread
 * - REQUEST: send a message requesting a reply, wait for the reply, then return or operate on it
 * - SEND: send a message without requesting a reply
 */
class Replier {
	constructor() {
		this.outgoing = new SingleUseMap()
		this.outgoingPersist = new Set()

		/** @type {Map<string, types.IPCReceiver>} */
		this.receivers = new Map()

		this.lastThreadID = 0
	}

	nextThreadID() {
		return process.pid + "_" + (++this.lastThreadID)
	}

	async baseOnMessage(raw, replyFn) {
		const { op, data, threadID } = raw
		// 5. receive request for stats
		if (op) {
			if (threadID) {
				// receives something like {op: "GET_GUILDS_FOR_USER", threadID: 1, data: {userID: "..."}}
				// this is for us to act on and respond to because it has an op and a thread
				// 6. get reply data
				let replyData
				if (this["REPLY_" + op]) {
					replyData = await this["REPLY_" + op](data)
				} else { // we can only have one thing replying.
					for (const receiver of this.receivers.values()) {
						if (receiver.op === op) {
							replyData = await receiver.fn(data)
							break // exit the receiver loop -\
						}
					} // \- to here
				}
				if (replyData === undefined) throw new Error("Nothing replied to op " + op)
				// sends something like {threadID: 1, data: {guilds: []}}
				// 7. send reply
				replyFn({ threadID: threadID, data: replyData })
			} else {
				// receives something like {op: "ADD_QUEUE", data: {...}}
				// this is for us to act on but not respond to because it has an op but no thread
				if (this["RECEIVE_" + op]) this["RECEIVE_" + op](data)
				for (const receiver of this.receivers.values()) {
					if (receiver.op === op) receiver.fn(data)
				}
			}
		} else {
			// receives something like {threadID: 1, data: {stats: []}}
			// this has a thread and no op, and is therefore a reply to something we sent earlier
			// 8. response to get stats arrives. call the promise resolve from the outgoing map and delete the key
			if (this.outgoing.has(threadID)) {
				if (this.outgoingPersist.has(threadID)) this.outgoing.get(threadID)(data)
				else this.outgoing.use(threadID)(data)
			} else console.error("threadID has no outgoing! This should not happen. Incoming message:", raw)
		}
	}

	buildRequest(op, data) {
		const threadID = this.nextThreadID()
		return { threadID, op, data }
	}

	baseRequest(op, data, sendFn) {
		// 3. request to a client
		const raw = this.buildRequest(op, data)
		// actually send
		sendFn(raw)
		return new Promise(resolve => {
			// 4. create a promise whose resolve will be called later when threadID is checked in onMessage.
			this.outgoing.set(raw.threadID, resolve)
		})
	}

	/**
	 * @param {[string, types.IPCReceiver][]} receivers
	 */
	addReceivers(receivers) {
		receivers.forEach(entry => {
			this.receivers.set(entry[0], entry[1])
		})
	}
}

module.exports = Replier
