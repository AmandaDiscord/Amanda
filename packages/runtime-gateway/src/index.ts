import "@amanda/logger"

import { Client } from "cloudstorm"
import Sync = require("heatsync")

import ConfigProvider = require("@amanda/config")
import WebsiteConnector = require("@amanda/web-internal")
import REPLProvider = require("@amanda/repl")

import type { APIUser } from "discord-api-types/v10"

const sync = new Sync()
const confprovider = new ConfigProvider(sync)
const webconnector = new WebsiteConnector(confprovider, "/gateway")
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

let user: APIUser | undefined = undefined

;(async () => {
	void new REPLProvider({ client, webconnector, sync, confprovider })
	client.on("debug", console.log)
	client.on("error", console.error)
	client.on("event", packet => {
		if (packet.t === "READY") {
			user = packet.d.user
			return webconnector.send(JSON.stringify({ op: 0, t: "USER_INIT", d: user }))
		} else if (packet.t === "GUILD_CREATE") {
			return webconnector.send(JSON.stringify({
				op: 0,
				t: "PARTIAL_GUILD_CREATE",
				d: {
					id: packet.d.id,
					voice_states: packet.d.voice_states
				},
				shard_id: packet.shard_id
			}))
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
	webconnector.on("open", () => {
		webconnector.send(JSON.stringify({ op: 0, t: "USER_INIT", d: user }))
	})
})()
