import "@amanda/logger"

import { Client } from "cloudstorm"

import sync = require("@amanda/sync")
import confprovider = require("@amanda/config")
import WebsiteConnector = require("@amanda/web-internal")
import REPLProvider = require("@amanda/repl")

const webconnector = new WebsiteConnector("/gateway")
const client = new Client(confprovider.config.current_token, {
	shards: confprovider.config.shards,
	totalShards: confprovider.config.total_shards,
	reconnect: true,
	intents: ["GUILD_VOICE_STATES"],
	ws: {
		compress: false,
		encoding: "json"
	}
})

;(async () => {
	void new REPLProvider({ client, webconnector, sync, confprovider })
	client.on("debug", console.log)
	client.on("error", console.error)
	client.on("event", packet => {
		if (packet.t === "VOICE_STATE_UPDATE") {
			if (packet.d.guild_id) {
				if (packet.d.channel_id === null) sql.orm.delete("voice_states", { user_id: parsed.d.user_id, guild_id: parsed.d.guild_id })
				else sql.orm.upsert("voice_states", { guild_id: parsed.d.guild_id, user_id: parsed.d.user_id, channel_id: parsed.d.channel_id || undefined }, { useBuffer: false })
			}
		}

		webconnector.send(JSON.stringify(packet))
	})
	webconnector.send(JSON.stringify({ op: 0, t: "SHARD_LIST", d: confprovider.config.shards })).catch(console.error)

	await client.connect()
	webconnector.on("message", data => {
		const single = Array.isArray(data)
			? Buffer.concat(data)
			: Buffer.from(data)

		const parsed = JSON.parse(single.toString())

		if (parsed.t === "SEND_MESSAGE" && parsed.d && typeof parsed.d.shard_id === "number") {
			const shard = Object.entries(client.shardManager.shards).find((e) => e[0] == parsed.d.shard_id)?.[1]
			if (!shard) return console.warn(`Shard ${parsed.d.shard_id} doesn't exist in this cluster`)
			delete parsed.d.shard_id
			delete parsed.t
			shard.connector.betterWs.sendMessage(parsed)
		}
	})
})()
