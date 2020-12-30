//@ts-check

const ipc = require("node-ipc")
const Server = require("node-ipc/dao/socketServer")
const Discord = require("thunderstorm")

/**
 * original ipc server doesn't have complete typings
 * this should not be instantiated
 */
class IPCServerWithBroadcast extends Server {
	constructor() {
		super()
		/** @type {any[]} */
		this.sockets
		throw new Error("This class should not be instantiated.")
	}
	/**
	 * @param {string} type
	 * @param {any} data
	 */
	broadcast(type, data) {}
}

class IPC {
	constructor(name, host, port) {
		ipc.config.id = name
		ipc.config.networkHost = host
		ipc.config.networkPort = port
		ipc.config.retry = 1000
		ipc.config.silent = true
		/** @type {boolean} */
		this.initialized = false
		/** @type {Discord.Collection<string, { clientID: string, shards: Array<number> }>} */
		this.clusterShards = new Discord.Collection()

		ipc.serveNet(() => {
			// @ts-ignore
			this.server.on("message", this.receive.bind(this))
			// @ts-ignore
			this.server.on("cluster", (data, socket) => {
				const {clientID, shards, clusterID} = data
				console.log(`Socket identified as ${clusterID}, total of ${shards.length} shards (${clientID})`)
				if (!this.initialized) this.initialized = true

				this.clusters.set(clusterID, socket)
				this.clusterShards.set(clusterID, { clientID, shards })
			})
			// @ts-ignore
			this.server.on("socket.disconnected", dsocket => {
				let disconnected = []
				this.clusters.forEach((socket, id) => {
					if (socket == dsocket) {
						this.clusters.delete(id)
						this.clusterShards.delete(id)
						disconnected.push(id)
					}
				})
				console.log("Socket disconnected, was "+disconnected.join(" "))
			})
		})
		/** @type {IPCServerWithBroadcast} */
		//@ts-ignore
		this.server = ipc.server
		this.server.start()

		/**
		 * Map cluster IDs to their IPC sockets.
		 * @type {Discord.Collection<string, any>}
		 */
		this.clusters = new Discord.Collection()

		this.replier = null
	}

	/**
	 * @param {import("./ipcserverreplier")} replier
	 */
	setReplier(replier) {
		this.replier = replier
		// console.log("Set IPC replier")
	}

	/**
	 * Get the socket that corresponds to a cluster ID.
	 */
	getCluster(id) {
		if (ipc.of["cluster-x"]) {
			return ipc.of["cluster-x"] || null
		} else {
			return this.clusters.get(id) || null
		}
	}

	/**
	 * Called when the server receives raw data.
	 */
	receive(raw, socket) {
		if (this.replier) {
			this.replier.onMessage(socket, raw)
		}
	}

	/**
	 * Send raw data to a socket.
	 */
	send(socket, raw) {
		if (socket) {
			this.server.emit(socket, "message", raw)
		} else {
			throw new Error("Socket does not exist. Did a shard disconnect?")
		}
	}

	/**
	 * Broadcast raw data to all sockets.
	 */
	broadcast(raw) {
		this.server.broadcast("message", raw)
	}

	/**
	 * @returns {Promise<boolean>}
	 */
	waitForClientID() {
		if (this.initialized) return Promise.resolve(true)
		else return new Promise(resolve => {
			this.server.once("cluster", () => {
				resolve(true)
			})
		})
	}
}

module.exports = IPC
