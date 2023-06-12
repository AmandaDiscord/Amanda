import "@amanda/logger"

import fs = require("fs")
import path = require("path")

import { Client } from "cloudstorm"

import confprovider = require("@amanda/config")
import sql = require("@amanda/sql")
import WebsiteConnector = require("@amanda/web-internal")
import REPLProvider = require("@amanda/repl")

const toSessionsJSON = path.join(__dirname, "../sessions.json")

let shardInfoChanged = false
let alreadyWrote = false
const _oldShards = confprovider.config.shards
const _oldTotalShards = confprovider.config.total_shards

const webconnector = new WebsiteConnector("/gateway")
const client = new Client(confprovider.config.current_token, {
	shards: confprovider.config.shards,
	totalShards: confprovider.config.total_shards,
	reconnect: true,
	intents: ["GUILD_VOICE_STATES", "GUILDS"],
	ws: {
		compress: false,
		encoding: "json"
	}
})

confprovider.addCallback(() => {
	if (!confprovider.config.shards.every((item, index) => _oldShards[index] === item)) shardInfoChanged = true
	if (confprovider.config.total_shards !== _oldTotalShards) shardInfoChanged = true
})

;(async () => {
	webconnector.on("open", () => {
		webconnector.send(JSON.stringify({ op: 0, t: "SHARD_LIST", d: confprovider.config.shards })).catch(console.error)
	})

	await sql.connect()
	void new REPLProvider({ client, webconnector, confprovider, sql })
	client.on("debug", console.log)
	client.on("error", console.error)
	client.on("event", async packet => {
		if (packet.t === "VOICE_STATE_UPDATE") {

			if (packet.d.guild_id) {
				if (packet.d.channel_id === null) {
					await sql.orm.delete("voice_states", {
						user_id: packet.d.user_id,
						guild_id: packet.d.guild_id
					})
				} else {
					await sql.orm.upsert("voice_states", {
						guild_id: packet.d.guild_id,
						user_id: packet.d.user_id,
						channel_id: packet.d.channel_id || undefined
					}, { useBuffer: false })
				}
			}

		} else if (packet.t === "GUILD_CREATE") {
			for (const state of packet.d.voice_states ?? []) {
				sql.orm.upsert("voice_states", {
					guild_id: packet.d.id,
					channel_id: state.channel_id,
					user_id: state.user_id
				}, { useBuffer: true })
			}
			sql.orm.triggerBufferWrite("voice_states")
		} else if (packet.t === "GUILD_DELETE") {
			if (packet.d.unavailable) return
			sql.orm.delete("voice_states", { guild_id: packet.d.id })
		}

		webconnector.send(JSON.stringify(packet))
	})

	let stats: fs.Stats | undefined = undefined
	try {
		stats = await fs.promises.stat(toSessionsJSON)
	} catch {
		stats = undefined
	}

	await client.fetchConnectInfo()

	if (stats && stats.mtimeMs >= (Date.now() - (1000 * 60 * 1.5))) {
		const data = await fs.promises.readFile(toSessionsJSON, { encoding: "utf8" })

		let sessions
		try {
			sessions = JSON.parse(data)
		} catch {
			sessions = {}
		}

		client.shardManager.spawn()
		for (const sid of Object.keys(sessions)) {
			const shard = Object.entries(client.shardManager.shards).find(e => e[0] == sid)?.[1]

			if (shard) {
				shard.connector.sessionId = sessions[sid][0]
				shard.connector.resumeAddress = sessions[sid][1]
				shard.connector.betterWs.address = sessions[sid][1] ?? shard.connector.betterWs.address
				shard.connector.seq = sessions[sid][2]

				console.log(`Setup previous resume info from session JSON for shard ${shard.id}`)
			}
		}
	} else await client.connect()

	webconnector.on("message", data => {
		const single = Array.isArray(data)
			? Buffer.concat(data)
			: Buffer.from(data)

		const str = single.toString()
		console.log(str)

		const parsed = JSON.parse(str)

		if (parsed.t === "SEND_MESSAGE" && parsed.d && typeof parsed.d.shard_id === "number") {
			const shard = Object.entries(client.shardManager.shards).find(e => e[0] == parsed.d.shard_id)?.[1]
			if (!shard) return console.warn(`Shard ${parsed.d.shard_id} doesn't exist in this cluster`)
			delete parsed.d.shard_id
			delete parsed.t
			shard.connector.betterWs.sendMessage(parsed)
		}
	})
})()

process.stdin.resume()

function exitHandler(...params: Array<unknown>) {
	if (shardInfoChanged) {
		try {
			fs.unlinkSync(toSessionsJSON)
		} catch {
			void 0
		}
		console.warn(...params)
		return
	}
	if (alreadyWrote) return
	alreadyWrote = true

	console.warn(...params)
	const data = {}
	for (const shard of Object.values(client.shardManager.shards)) {
		data[shard.id] = [shard.connector.sessionId, shard.connector.resumeAddress, shard.connector.seq]
	}

	fs.writeFileSync(toSessionsJSON, JSON.stringify(data))
	console.log("Wrote session data to fs to restore later")
	process.exit()
}

process.on("exit", exitHandler)
process.on("SIGINT", exitHandler)
process.on("SIGUSR1", exitHandler)
process.on("SIGUSR2", exitHandler)
process.on("uncaughtException", exitHandler)
