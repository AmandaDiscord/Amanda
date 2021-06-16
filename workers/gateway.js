const { parentPort } = require("worker_threads")

const Client = require("cloudstorm")

const config = require("../config")

/** @type {Array<{ s_id: number, data: { op: number, d: any } }>} */
const queue = []

const Gateway = new Client(config.bot_token, {
	intents: ["DIRECT_MESSAGES", "GUILDS", "GUILD_MESSAGES", "GUILD_VOICE_STATES"],
	firstShardId: config.shard_list[0],
	shardAmount: config.total_shards,
	lastShardId: config.shard_list[config.shard_list.length - 1],
	reconnect: true
})

const presence = {}

;(async () => {
	await Gateway.connect()
	console.log("Gateway initialized.")

	Gateway.on("event", data => {
		// Send data (Gateway -> Worker)
		parentPort.postMessage({ op: "DISCORD", data, threadID: -1 })
	})

	Gateway.on("shardReady", async (d) => {
		if (!d.ready) return
		const squeue = queue.filter(i => i.s_id === d.id)
		const shards = Object.values(Gateway.shardManager.shards)
		for (const q of squeue) {
			const shard = shards.find(s => s.id === d.id)
			if (shard) {
				try {
					await shard.connector.betterWs.sendMessage(q.data)
					queue.splice(queue.indexOf(q), 1)
				} catch {
					return console.error(`Unable to send message:\n${JSON.stringify(q)}`)
				}
			} else {
				console.error(`No shard found to send WS Message:\n${require("util").inspect(q, true, 2, true)}`)
			}
		}

		if (shards.every(s => s.ready) && queue.length) console.log(`All shards are ready, but the queue still has entries in it.\n${require("util").inspect(queue)}`)
	})

	Gateway.on("error", console.error)
	Gateway.on("disconnected", console.log)

	parentPort.on("message", async (message) => {
		const { op, data, threadID } = message

		if (op === "STATS") {
			const shards = Object.values(Gateway.shardManager.shards)
			const d = { ram: process.memoryUsage(), uptime: process.uptime(), shards: shards.map(s => s.id), latency: shards.map(s => s.latency) }
			parentPort.postMessage({ op: "RESPONSE", data: d, threadID })
		} else if (op === "STATUS_UPDATE") {

			if (!data.name && !data.status && !data.type && !data.url) return parentPort.postMessage({ op: "RESPONSE", data: presence, threadID })

			const payload = {}
			const game = {}
			if (data.name !== undefined) game["name"] = data.name
			if (data.type !== undefined) game["type"] = data.type
			if (data.url !== undefined) game["url"] = data.url
			if (data.status !== undefined) payload["status"] = data.status

			if (game.name || game.type || game.url) payload["activities"] = [game]

			if (payload.game && payload.game.name && payload.game.type === undefined) payload.game.type = 0

			Object.assign(presence, payload)

			parentPort.postMessage({ op: "RESPONSE", data: presence, threadID })

			for (const shard of Object.values(Gateway.shardManager.shards)) {
				if (shard.ready) shard.presenceUpdate(payload)
				// @ts-ignore
				else queue.push({ s_id: shard.id, data: { op: Client.Constants.GATEWAY_OP_CODES.PRESENCE_UPDATE, d: shard.connector._checkPresenceData(payload) } })
			}
		} else if (op === "SEND_MESSAGE") {

			const sid = Number((BigInt(data.d.guild_id) >> BigInt(22)) % BigInt(config.total_shards))
			const shard = Object.values(Gateway.shardManager.shards).find(s => s.id === sid)
			if (shard) {
				try {
					if (shard.ready) await shard.connector.betterWs.sendMessage(data)
					else queue.push({ s_id: shard.id, data: data })
				} catch {
					return parentPort.postMessage({ op: "ERROR_RESPONSE", data: `Unable to send message:\n${JSON.stringify(data)}`, threadID })
				}
				parentPort.postMessage({ op: "RESPONSE", data: "Message sent", threadID })
			} else {
				console.log(`No shard found to send WS Message:\n${require("util").inspect(data, true, 2, true)}`)
				parentPort.postMessage({ op: "ERROR_RESPONSE", data: `Unable to send message:\n${JSON.stringify(data)}`, threadID })
			}
		}
	})
})().catch(console.error)

process.on("unhandledRejection", console.error)
