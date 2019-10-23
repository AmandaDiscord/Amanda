//@ts-check

const ipc = require("node-ipc")
const Server = require("node-ipc/dao/socketServer")

const passthrough = require("../passthrough")
const {config, reloader} = passthrough

let IPCRouter = require("./ipcserverrouter.js")
reloader.setupWatch(["./website/modules/ipcserverrouter.js"])
reloader.useSync("./website/modules/ipcserverrouter.js", IPCRouter)

function* idGenerator() {
	let i = 0
	while (true) yield i++
}
const ids = idGenerator()
function nextID() {
	return ids.next().value
}

/**
 * original ipc server doesn't have complete typings
 * this should not be instantiated
 */
class IPCServerWithBroadcast extends Server {
	constructor() {
		super()
		/** @type {any[]} */
		this.sockets
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

		ipc.serveNet(() => {
			this.server.on("message", this.receive.bind(this))
			this.server.on("shard", (data, socket) => {
				const {total, me} = data
				console.log("Socket identified as "+me.join(" ")+", total "+total)
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

		this.requests = new Map()

		this.addRouter()
		reloader.reloadEvent.on("ipcserverrouter.js", () => {
			setTimeout(() => { // wait for object sync
				this.addRouter()
			})
		})

		/** @type {{op: string, fn: (data: any) => any, shouldRemove: () => boolean}[]} */
		this.receivers = []
	}

	addRouter() {
		this.router = new IPCRouter.router(this)
	}

	/** @param {{op: string, fn: (data: any) => any, shouldRemove: () => boolean}[]} receivers */
	addReceivers(receivers) {
		this.receivers = this.receivers.concat(receivers)
		console.log(`Added ${receivers.length} receivers, total ${this.receivers.length}`)
	}

	filterReceivers() {
		this.receivers = this.receivers.filter(r => !r.shouldRemove())
		console.log(`Filtered receivers, ${this.receivers.length} remaining`)
	}


	/**
	 * Get the socket that corresponds to a shard ID.
	 */
	getShard(id) {
		if (ipc.of["shard-x"]) {
			return ipc.of["shard-x"]
		} else {
			return this.shards.get(id)
		}
	}

	/**
	 * Get the socket that corresponds to a guild ID.
	 */
	getShardForGuild(id) {
		let shardID = Number((BigInt(id) >> BigInt(22)) % BigInt(this.totalShards))
		return this.getShard(shardID)
	}

	/**
	 * Called when the server receives raw data.
	 */
	receive(raw, socket) {
		if (this.requests.has(raw._id)) {
			this.requests.get(raw._id)(raw.data)
		}
		if (raw.op) {
			this.receivers.forEach(receiver => {
				if (receiver.op === raw.op) {
					receiver.fn(raw.data)
				}
			})
		}
	}

	/**
	 * Send raw data to a socket.
	 */
	send(socket, raw) {
		this.server.emit(socket, "message", raw)
	}

	/**
	 * Broadcast raw data to all sockets.
	 */
	broadcast(raw) {
		this.server.broadcast("message", raw)
	}

	/**
	 * Request information from a socket. Returns the data.
	 */
	request(socket, op, data) {
		let _id = nextID()
		let raw = {_id, op, data}
		this.send(socket, raw)
		return new Promise(resolve => {
			this.requests.set(_id, resolve)
		}).then(data => {
			this.requests.delete(_id)
			return data
		})
	}

	/**
	 * Request information from the socket for a guild. Returns the data.
	 */
	requestFromGuild(guildID, op, data) {
		const socket = this.getShardForGuild(guildID)
		return this.request(socket, op, data)
	}

	/**
	 * Request information from all sockets. Combines the data and returns the result.
	 */
	requestAll(op, data, combineMethod = null) {
		let _id = nextID()
		let raw = {_id, op, data}
		this.broadcast(raw)
		return new Promise(resolve => {
			let parts = []
			this.requests.set(_id, part => {
				parts.push(part)
				if (parts.length == this.server.sockets.length) {
					if (combineMethod === "truthy") {
						resolve(parts.find(p => p))
					} else if (combineMethod === "concat") {
						resolve([].concat(...parts))
					} else if (combineMethod === "concatProps") {
						//console.log(parts)
						let result = {}
						let keys = Object.keys(parts[0])
						keys.forEach(k => {
							result[k] = [].concat(...parts.map(p => p[k]))
						})
						//console.log(result)
						resolve(result)
					} else if (combineMethod === "add") {
						resolve(parts.reduce((acc, cur) => (acc + cur), 0))
					} else {
						resolve(parts)
					}
				}
			})
		}).then(result => {
			this.requests.delete(_id)
			return result
		})
	}
}

module.exports = IPC
