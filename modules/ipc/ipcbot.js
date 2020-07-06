// @ts-check

const ipc = require("node-ipc")

const passthrough = require("../../passthrough")
const { client, config, reloader } = passthrough

const utils = require("../utilities")
reloader.sync("./modules/utilities/index.js", utils)

class IPC {
	constructor() {
		ipc.config.networkHost = config.website_ipc_bind
		ipc.config.networkPort = 6544
		ipc.config.retry = 1500
		ipc.config.silent = true
		this.socket = null
		this.replier = null
	}

	/**
	 * @param {import("./ipcbotreplier")} replier
	 */
	setReplier(replier) {
		this.replier = replier
	}

	connect() {
		const shard = "shard-" + utils.getShardsArray().join("_")
		ipc.config.id = shard
		let shouldBeConnected = true // for ensuring that only one disconnect warning is sent
		ipc.connectToNet("website", () => {
			this.socket = ipc.of.website
			this.socket.once("connect", () => {
				shouldBeConnected = true
				this.socket.on("message", this.receive.bind(this))
			})
			this.socket.on("connect", () => {
				shouldBeConnected = true
				this.socket.emit("shard", { clientID: client.user.id, total: client.options.shardCount, me: utils.getShardsArray() })
				console.log("Connected to web")
			})
			this.socket.on("disconnect", () => {
				if (shouldBeConnected === true) {
					console.log("Disconnected from web. This should not happen!")
				}
				shouldBeConnected = false
			})
		})
	}

	/**
	 * Called when the socket receives raw data.
	 */
	receive(raw) {
		this.replier.baseOnMessage(raw, rawReply => this.send(rawReply))
	}

	/**
	 * Send raw data to the server.
	 */
	send(raw) {
		this.socket.emit("message", raw)
	}
}

module.exports = IPC
