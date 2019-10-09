//@ts-check

const ipc = require("node-ipc")
const path = require("path")

const passthrough = require("../passthrough")
const {client, config, queueStore, reloader} = passthrough

let IPCRouter = require("./ipcbotrouter.js")
reloader.setupWatch(["./modules/ipcbotrouter.js"])
reloader.useSync("./modules/ipcbotrouter.js", IPCRouter)

class IPC {
	constructor() {
		ipc.config.networkHost = config.website_ipc_bind
		ipc.config.networkPort = 6544
		ipc.config.retry = 1500
		ipc.config.silent = true
		this.socket = null
		this.addRouter()
		reloader.reloadEvent.on("ipcbotrouter.js", () => {
			setTimeout(() => { // wait for object sync
				this.addRouter()
			})
		})
	}

	addRouter() {
		//console.log("Adding router")
		this.router = new IPCRouter.router(this)
	}

	connect() {
		let shards
		if (client.options.shards) {
			if (typeof client.options.shards === "number") {
				shards = [client.options.shards]
			} else {
				shards = client.options.shards
			}
		}
		let shard = "shard-"+shards.join("_")

		ipc.config.id = shard
		ipc.connectToNet("website", () => {
			this.socket = ipc.of.website
			this.socket.once("connect", () => {
				this.socket.on("message", this.receive.bind(this))
			})
			this.socket.on("connect", () => {
				this.socket.emit("shard", {total: client.options.totalShardCount, me: shards})
				console.log("Connected to web")
			})
			this.socket.on("disconnect", () => {
				console.log("Disconnected from web. This should not happen!")
			})
		})
	}

	/**
	 * Called when the socket receives raw data.
	 */
	receive(raw) {
		let response = this.router[raw.op](raw.data)
		if (response instanceof Promise) {
			response.then(data => {
				this.reply(raw, data)
			})
		} else {
			this.reply(raw, response)
		}
	}

	/**
	 * Reply to raw data with response data.
	 */
	reply(rawOriginal, data) {
		let rawResponse = {_id: rawOriginal._id, data: data}
		this.send(rawResponse)
	}

	/**
	 * Send raw data to the server.
	 */
	send(raw) {
		this.socket.emit("message", raw)
	}
}

module.exports = IPC
