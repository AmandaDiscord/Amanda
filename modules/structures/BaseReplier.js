const SingleUseMap = require("../structures/SingleUseMap")

class BaseReplier {
	constructor() {
		this.outgoing = new SingleUseMap()
		this.outgoingPersist = new Set()

		/** @type {Map<string, import("../../typings").IPCReceiver>} */
		this.receivers = new Map()

		this.lastThreadID = 0
	}

	nextThreadID() {
		return `${process.pid}_${(++this.lastThreadID)}`
	}

	/**
	 * @param {[string, import("../../typings").IPCReceiver][]} receivers
	 */
	addReceivers(receivers) {
		receivers.forEach(entry => {
			this.receivers.set(entry[0], entry[1])
		})
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
}

module.exports = BaseReplier
