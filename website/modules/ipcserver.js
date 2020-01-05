//@ts-check

const ipc = require("node-ipc")
const Server = require("node-ipc/dao/socketServer")

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
			this.server.on("message", this.receive.bind(this))
			this.server.on("shard", (data, socket) => {
				const {clientID, total, me} = data
				console.log(`Socket identified as ${me.join(" ")}, total ${total} (${clientID})`)
				this.clientID = clientID
				this.totalShards = total
				me.forEach(id => {
					this.shards.set(id, socket)
				})
			})
			this.server.on("socket.disconnected", dsocket => {
				let disconnected = []
				this.shards.forEach((socket, id) => {
					if (socket == dsocket) {
						this.shards.delete(id)
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
		 * Map shard IDs to their IPC sockets.
		 * @type {Map<number, any>}
		 */
		this.shards = new Map()
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
	 * Get the socket that corresponds to a shard ID.
	 */
	getShard(id) {
		if (ipc.of["shard-x"]) {
			return ipc.of["shard-x"] || null
		} else {
			return this.shards.get(id) || null
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
			this.server.once("shard", ({clientID}) => {
				resolve(clientID)
			})
		})
	}
}

module.exports = IPC
