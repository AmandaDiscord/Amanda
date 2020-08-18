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
		const cluster = `cluster-${config.cluster_id}`
		ipc.config.id = cluster
		let shouldBeConnected = true // for ensuring that only one disconnect warning is sent
		ipc.connectToNet("website", () => {
			this.socket = ipc.of.website
			this.socket.once("connect", () => {
				shouldBeConnected = true
				this.socket.on("message", this.receive.bind(this))
			})
			this.socket.on("connect", () => {
				shouldBeConnected = true
				this.socket.emit("cluster", { clientID: client.user.id, first: config.shard_list[0], clusterID: config.cluster_id })
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
