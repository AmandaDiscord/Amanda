const fetchdefault = require("node-fetch").default
/** @type {fetchdefault} */
// @ts-ignore
const fetch = require("node-fetch")
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
	 * @param {"GET" | "PATCH" | "POST"} method
	 * @param {any} body
	 */
	async _makeRequest(path, method = "GET", body) {
		if (!path.startsWith("/")) path = `/${path}`
		const payload = {}
		const headers = {}
		if (body) payload["body"] = JSON.stringify(body)
		if (this.auth) headers["Authorization"] = this.auth

		payload["method"] = method
		payload["headers"] = headers


		const response = await fetch(encodeURI(`${this.baseURL}${path}`), payload)
		if (!response) return Promise.reject(new Error(`An error occured when requesting from a worker\n${util.inspect({ url: `${this.baseURL}${path}`, method: method, payload: payload })}`))

		if (response.status != 200) {
			const data = await response.json()
			return Promise.reject(new Error(`An error occured when requesting from a worker\n${util.inspect({ status: response.status, error: data.error })}`))
		}

		const data = await response.json()

		return data.data
	}
}

module.exports = BaseWorkerRequester
