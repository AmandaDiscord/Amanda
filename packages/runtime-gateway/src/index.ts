import "@amanda/logger"

import fs = require("fs")
import path = require("path")

import { Client } from "cloudstorm"

import confprovider = require("@amanda/config")
import sql = require("@amanda/sql")
import WebsiteConnector = require("@amanda/web-internal")
import REPLProvider = require("@amanda/repl")

const toSessionsJSON = path.join(__dirname, "../sessions.json")

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

;(async () => {
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

		}

		webconnector.send(JSON.stringify(packet))
	})

	webconnector.send(JSON.stringify({ op: 0, t: "SHARD_LIST", d: confprovider.config.shards })).catch(console.error)

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

		const parsed = JSON.parse(single.toString())

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
