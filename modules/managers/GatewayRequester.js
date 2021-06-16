// @ts-check

const BaseReplier = require("../structures/BaseReplier")

class GatewayRequester extends BaseReplier {
	/**
	 * @param {import("worker_threads").Worker} worker
	 */
	constructor(worker) {
		super()
		this.worker = worker
	}
	getStats() {
		return this._makeRequest("STATS")
	}
	/**
	 * @param {import("../../typings").GatewayStatusUpdateData} status
	 * @returns {Promise<import("../../typings").PresenceData>}
	 */
	statusUpdate(status) {
		return this._makeRequest("STATUS_UPDATE", status)
	}
	/**
	 * @param {import("lavacord").DiscordPacket} packet
	 */
	sendMessage(packet) {
		return this._makeRequest("SEND_MESSAGE", packet)
	}
	/**
	 * @param {"STATS" | "STATUS_UPDATE" | "SEND_MESSAGE"} op
	 * @param {any} [data]
	 */
	_makeRequest(op, data) {
		return this.baseRequest(op, data, (d) => this.worker.postMessage(d))
	}
}

module.exports = GatewayRequester
