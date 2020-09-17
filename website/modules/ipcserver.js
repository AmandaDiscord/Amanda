//@ts-check

const ipc = require("node-ipc")
const Server = require("node-ipc/dao/socketServer")
const Discord = require("discord.js")

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
		/** @type {string} */
		this.clientID = null

		ipc.serveNet(() => {
			// @ts-ignore
			this.server.on("message", this.receive.bind(this))
			// @ts-ignore
			this.server.on("cluster", (data, socket) => {
				const {clientID, total, clusterID} = data
				console.log(`Socket identified as ${clusterID}, total of ${total} shards (${clientID})`)
				this.clientID = clientID
				this.totalShards = this.totalShards ? this.totalShards + total : total
				if (!this.shardsPerCluster) {
					/** @type {Map<string, number>} */
					this.shardsPerCluster = new Map()
				}
				this.shardsPerCluster.set(clusterID, total)
				this.clusters.set(clusterID, socket)
			})
			// @ts-ignore
			this.server.on("socket.disconnected", dsocket => {
				let disconnected = []
				this.clusters.forEach((socket, id) => {
					if (socket == dsocket) {
						this.clusters.delete(id)
						if (this.shardsPerCluster.get(id)) {
							this.totalShards -= this.shardsPerCluster.get(id)
							this.shardsPerCluster.delete(id)
						}
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
		this.totalShards = 1

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
	 * @returns {Promise<string>}
	 */
	waitForClientID() {
		if (this.clientID) return Promise.resolve(this.clientID)
		else return new Promise(resolve => {
			this.server.once("cluster", ({ clusterID }) => {
				resolve(clusterID)
			})
		})
	}
}

module.exports = IPC
