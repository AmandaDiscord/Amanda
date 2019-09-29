//@ts-check

const ipc = require("node-ipc")
const Server = require("node-ipc/dao/socketServer")

const passthrough = require("../passthrough")
const {config} = passthrough

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
		ipc.config.id = "website"
		ipc.config.networkHost = config.website_ipc_bind
		ipc.config.networkPort = 6544
		ipc.config.retry = 1500
		ipc.config.silent = true

		ipc.serveNet(() => {
			this.server.on("message", this.receive.bind(this))
			this.server.on("shard", (data, socket) => {
				const {total, me} = data
				this.totalShards = total
				me.forEach(id => {
					this.shards.set(id, socket)
				})
			})
		})
		/** @type {IPCServerWithBroadcast} */
		//@ts-ignore
		this.server = ipc.server
		this.server.start()

		/**
		 * Map shard IDs to their IPC sockets.
		 * @type {Map<number, string>}
		 */
		this.shards = new Map()
		this.totalShards = 1

		this.requests = new Map()
	}

	getShard(id) {
		if (ipc.of["shard-x"]) {
			return ipc.of["shard-x"]
		} else {
			return this.shards.get(id)
		}
	}

	getShardForGuild(id) {
		let shardID = +(+id).toString(2).slice(0, -22) % this.totalShards
		return this.getShard(shardID)
	}

	receive(data, socket) {
		//console.log("Got a message:", data)
		if (this.requests.has(data._id)) {
			this.requests.get(data._id)(data.data)
		}
	}

	send(socket, data) {
		this.server.emit(socket, "message", data)
	}

	broadcast(data) {
		//console.log("Sending data")
		this.server.broadcast("message", data)
	}

	request(socket, data) {
		let id = nextID()
		data._id = id
		this.send(socket, data)
		return new Promise(resolve => {
			this.requests.set(id, resolve)
		})
	}

	requestAll(data, combineMethod = null) {
		let id = nextID()
		data._id = id
		this.broadcast(data)
		return new Promise(resolve => {
			let parts = []
			this.requests.set(id, part => {
				parts.push(part)
				if (parts.length == this.server.sockets.length) {
					if (combineMethod == "concat") {
						resolve([].concat(...parts))
					} else if (combineMethod == "concatProps") {
						console.log(parts)
						let result = {}
						let keys = Object.keys(parts[0])
						keys.forEach(k => {
							result[k] = [].concat(...parts.map(p => p[k]))
						})
						console.log(result)
						resolve(result)
					} else if (combineMethod == "add") {
						resolve(parts.reduce((acc, cur) => (acc + cur), 0))
					} else {
						resolve(parts)
					}
				}
			})
		})
	}
}

module.exports = IPC
