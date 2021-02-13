const BaseWorkerRequester = require("../structures/BaseWorkerRequester")

const config = require("../../config")

class CacheRequester extends BaseWorkerRequester {
	constructor() {
		super(`${config.cache_server_protocol}://${config.cache_server_domain}`, config.redis_password)
	}
	getStats() {
		return this._makeRequest("/stats", "get")
	}
	/**
	 * @param {import("../../typings").CacheRequestData<keyof import("../../typings").CacheOperations>} query
	 */
	getData(query) {
		return this._makeRequest("/request", "post", query)
	}
}

module.exports = CacheRequester
