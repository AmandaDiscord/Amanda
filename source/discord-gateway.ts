import { parentPort as parentport } from "worker_threads"
if (!parentport) throw new Error("NOT_A_WORKER")
const parentPort = parentport
import util from "util"

import CloudStorm from "cloudstorm"
import HeatSync from "heatsync"

import passthrough from "./passthrough"

const sync = new HeatSync()

Object.assign(passthrough, { sync })

import logger from "./utils/logger"

const config = require("../config") as import("./types").Config
import constants from "./constants"

Object.assign(passthrough, { config, constants })

const worker_id = "gateway"
const sentAckString = "Message sent"

const client = new CloudStorm.Client(config.bot_token, {
	intents: ["GUILDS", "GUILD_VOICE_STATES", "DIRECT_MESSAGES", "GUILD_MESSAGES"],
	shards: config.shard_list,
	totalShards: config.total_shards,
	reconnect: true,
	ws: {
		compress: false,
		encoding: "json"
	}
})

const queue = [] as Array<{ s_id: number, data: { op: number, d: unknown } }>

const presence = {} as import("discord-typings").GatewayPresenceUpdate

client.connect().catch((e) => logger.error(e, worker_id))
logger.info("gateway started", worker_id)

client.on("event", d => parentPort.postMessage({ o: constants.GATEWAY_WORKER_CODES.DISCORD, d }))

client.on("shardReady", async (d) => {
	if (!d.ready) return
	const squeue = queue.filter(i => i.s_id === d.id)
	const shards = Object.values(client.shardManager.shards)
	for (const q of squeue) {
		const shard = shards.find(s => s.id === d.id)
		if (shard) {
			try {
				await shard.connector.betterWs?.sendMessage(q.data as import("cloudstorm").IWSMessage)
				queue.splice(queue.indexOf(q), 1)
			} catch {
				return logger.error(`Unable to send message:\n${JSON.stringify(q)}`, worker_id)
			}
		} else logger.error(`No shard found to send WS Message:\n${util.inspect(q, true, 2, true)}`, worker_id)
	}

	if (shards.every(s => s.ready) && queue.length) logger.warn(`All shards are ready, but the queue still has entries in it.\n${util.inspect(queue)}`, worker_id)
})

client.on("error", (e) => logger.error(e, worker_id))

parentPort.on("message", async (message: { o: number, d: unknown, t: string }) => {

	if (message.o === constants.GATEWAY_WORKER_CODES.STATS) {
		const shards = Object.values(client.shardManager.shards)
		const data = { ram: process.memoryUsage(), uptime: process.uptime(), shards: shards.map(s => s.id), latency: shards.map(s => s.latency) }
		parentPort.postMessage({ o: constants.GATEWAY_WORKER_CODES.RESPONSE, d: data, t: message.t })


	} else if (message.o === constants.GATEWAY_WORKER_CODES.STATUS_UPDATE) {
		const packet = message.d as { status?: string; activities?: Array<import("discord-typings").Activity> }

		if (!packet.status && !packet.activities) return parentPort.postMessage({ o: constants.GATEWAY_WORKER_CODES.RESPONSE, d: presence, t: message.t })

		Object.assign(presence, packet)

		parentPort.postMessage({ o: constants.GATEWAY_WORKER_CODES.RESPONSE, d: presence, t: message.t })

		for (const shard of Object.values(client.shardManager.shards)) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			if (shard.ready) shard.presenceUpdate(presence)
			else queue.push({ s_id: shard.id, data: { op: CloudStorm.Constants.GATEWAY_OP_CODES.PRESENCE_UPDATE, d: presence } })
		}


	} else if (message.o === constants.GATEWAY_WORKER_CODES.SEND_MESSAGE) {
		const packet = message.d as { d: { guild_id: string }, op: number }
		const sid = Number((BigInt(packet.d.guild_id) >> BigInt(22)) % BigInt(config.total_shards))
		const shard = Object.values(client.shardManager.shards).find(s => s.id === sid)
		if (shard) {
			try {
				if (shard.ready) await shard.connector.betterWs?.sendMessage(message.d as import("cloudstorm").IWSMessage)
				else queue.push({ s_id: shard.id, data: packet })
			} catch {
				return parentPort.postMessage({ o: constants.GATEWAY_WORKER_CODES.ERROR_RESPONSE, d: `Unable to send message:\n${JSON.stringify(message.d)}`, t: message.t })
			}
			parentPort.postMessage({ o: constants.GATEWAY_WORKER_CODES.RESPONSE, d: sentAckString, t: message.t })
		} else {
			logger.error(`No shard found to send WS Message:\n${util.inspect(message.d, true, 2, true)}`, worker_id)
			parentPort.postMessage({ o: constants.GATEWAY_WORKER_CODES.ERROR_RESPONSE, d: `Unable to send message:\n${JSON.stringify(message.d)}`, t: message.t })
		}
	}
})

process.on("unhandledRejection", (e) => logger.error(e, worker_id))
process.on("uncaughtException", (e) => logger.error(e, worker_id))
