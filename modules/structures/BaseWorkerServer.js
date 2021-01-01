const express = require("express")
const server = express()
server.disable("x-powered-by")

const config = require("../../config")

server.use(express.json({ type: ["application/json", "text/plain"], limit: "50mb" }))
server.use(express.urlencoded({ extended: true }))

class BaseWorkerServer {
	/**
	 * @param {"gateway" | "cache"} worker
	 * @param {string} password
	 */
	constructor(worker, password) {
		this.worker = worker
		this.server = server
		this.password = password

		this.initialize()
	}
	initialize() {
		/** @type {number} */
		let port
		if (this.worker === "cache") port = Number(config.cache_server_domain.split(":")[1])
		else {
			console.error("Invalid worker type")
			process.exit()
		}

		server.listen(port, () => console.log(`${this.worker} server started on port ${port}`))
	}
	/**
	 * @param {string} provided
	 */
	authenticate(provided) {
		return provided === this.password
	}
	/**
	 * @param {string} path
	 * @param {(request: express.Request, response: express.Response) => any} callback
	 */
	get(path, callback) {
		server.get(path, (request, response) => this.defaultCallback(request, response, callback))
	}
	/**
	 * @param {string} path
	 * @param {(request: express.Request, response: express.Response) => any} callback
	 */
	post(path, callback) {
		server.post(path, (request, response) => this.defaultCallback(request, response, callback))
	}
	/**
	 * @param {string} path
	 * @param {(request: express.Request, response: express.Response) => any} callback
	 */
	patch(path, callback) {
		server.patch(path, (request, response) => this.defaultCallback(request, response, callback))
	}
	/**
	 * @param {express.Request} request
	 * @param {express.Response} response
	 * @param {(request: express.Request, response: express.Response) => any} callback
	 * @private
	 */
	defaultCallback(request, response, callback) {
		const auth = request.headers.authorization
		if (!auth) return response.status(404).send(this.createErrorResponse("Not found"))
		if (!this.authenticate(auth)) return response.status(404).send(this.createErrorResponse("Not found"))
		callback(request, response)
	}
	createErrorResponse(data) {
		return JSON.stringify({ error: data })
	}
	createDataResponse(data) {
		return JSON.stringify({ data: data })
	}
}

module.exports = BaseWorkerServer
