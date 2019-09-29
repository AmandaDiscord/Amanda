//@ts-check

const ipc = require("node-ipc")

const passthrough = require("../passthrough")
const {client, config, queueStore} = passthrough

class IPC {
	constructor() {
		ipc.config.networkHost = config.website_ipc_bind
		ipc.config.networkPort = 6544
		ipc.config.retry = 1500
		ipc.config.silent = true
		this.socket = null
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
			this.socket.on("connect", () => {
				this.socket.emit("shard", {total: client.options.totalShardCount, me: shards})
				this.socket.on("message", this.receive.bind(this))
			})
		})
	}

	receive(data) {
		//console.log("Got a message:", data)
		if (data.op === "GET_DASH_GUILDS") {
			let userID = data.userID

			let guilds = []
			let npguilds = []
			for (let guild of client.guilds.filter(g => g.members.has(userID)).values()) {
				let filteredGuild = ["name", "id", "icon", "nameAcronym"].reduce((acc, cur) => (acc[cur] = guild[cur], acc), {})
				if (queueStore.store.has(guild.id) || guild.members.get(userID).voice.channelID) npguilds.push(filteredGuild)
				else guilds.push(filteredGuild)
			}
			this.reply(data, {guilds, npguilds})
		}
	}

	reply(original, data) {
		let response = {_id: original._id, data: data}
		this.send(response)
	}

	send(data) {
		//console.log("Sending data:", data)
		this.socket.emit("message", data)
	}
}

module.exports = IPC
