const BaseWorkerRequester = require("../structures/BaseWorkerRequester")

const config = require("../../config")

class GatewayRequester extends BaseWorkerRequester {
	constructor() {
		super(`${config.gateway_server_protocol}://${config.gateway_server_domain}`, config.redis_password)
	}
	getStats() {
		return this._makeRequest("/stats", "GET")
	}
	/**
	 * @returns {Promise<import("thunderstorm/typings/internal").InboundDataType<"READY">>}
	 */
	login() {
		return this._makeRequest("/login", "GET")
	}
	/**
	 * @param {import("../../typings").GatewayStatusUpdateData} status
	 * @returns {Promise<import("../../typings").PresenceData>}
	 */
	statusUpdate(status) {
		return this._makeRequest("/status-update", "PATCH", status)
	}
	/**
	 * @param {import("lavacord").DiscordPacket} packet
	 */
	sendMessage(packet) {
		return this._makeRequest("/send-message", "POST", packet)
	}
}

module.exports = GatewayRequester
