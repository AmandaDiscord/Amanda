// @ts-check

const c = require("centra")
const util = require("util")

class BaseWorkerRequester {
	/**
	 * @param {string} baseURL
	 * @param {string} auth
	 */
	constructor(baseURL, auth) {
		this.baseURL = baseURL
		this.auth = auth || null
	}
	/**
	 * @param {string} path
	 * @param {"get" | "patch" | "post"} method
	 * @param {any} [body]
	 */
	async _makeRequest(path, method = "get", body = undefined) {
		if (!path.startsWith("/")) path = `/${path}`
		/** @type {Object.<string, string>} */
		const headers = {}
		if (this.auth) headers["Authorization"] = this.auth

		const r = c(this.baseURL, method).path(path).header(headers)
		if (body) r.body(body, "json")
		const response = await r.send()
		if (!response) return Promise.reject(new Error(`An error occured when requesting from a worker\n${util.inspect({ url: `${this.baseURL}${path}`, method: method, payload: body })}`))

		if (response.statusCode != 200) {
			const d = await response.json()
			return Promise.reject(new Error(`An error occured when requesting from a worker\n${util.inspect({ status: response.statusCode, error: d.error })}`))
		}

		const data = await response.json()

		return data.data
	}
}

module.exports = BaseWorkerRequester
