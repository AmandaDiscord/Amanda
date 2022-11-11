import tap from "tap"

// Setup index

import util from "util"

import CommandManager from "./modules/CommandManager"
import HeatSync from "heatsync"
import { SnowTransfer } from "snowtransfer"
import { Client, Constants } from "cloudstorm"

import Amanda from "./modules/Amanda"

const config = {
	bot_token: "really.secret.key",
	machine_id: "tap.test",
	shard_list: [0],
	cluster_id: "tap",
	total_shards: 1,
	is_dev_env: true,
	post_commands: false,
	db_enabled: false,
	website_protocol: "http"
} as import("./types").Config

import constants from "./constants"
import passthrough from "./passthrough"

const snow = new SnowTransfer(config.bot_token, { disableEveryone: true, baseHost: "http://localhost:10430" })
const cloud = new Client(config.bot_token, {
	snowtransferInstance: snow,
	intents: ["GUILDS", "GUILD_VOICE_STATES"],
	shards: config.shard_list,
	totalShards: config.total_shards,
	reconnect: true,
	ws: {
		compress: false,
		encoding: "json"
	}
})
const client = new Amanda(snow)
const commands = new CommandManager<[import("discord-typings").Interaction, import("@amanda/lang").Lang]>()
const sync = new HeatSync()

Object.assign(passthrough, { client, sync, config, constants, commands })
const logger = sync.require("./utils/logger") as typeof import("./utils/logger")

import { ThreadBasedReplier } from "./utils/classes/ThreadBasedReplier"
const requester = new ThreadBasedReplier()

Object.assign(passthrough, { requester })

sync.events.on("error", logger.error)
sync.events.on("any", file => logger.info(`${file} was changed`))
client.snow.requestHandler.on("requestError", (p, e) => logger.error(`Request Error:\n${p}\n${e}`))

sync.require([
	"./modules/EventManager",
	"./commands/hidden", // do not load music related commands since it's really hard to emulate voice connections
	"./commands/images",
	"./commands/interaction",
	"./commands/meta",
	"./commands/status"
])

async function globalErrorHandler(e: Error | undefined) {
	const text = require("./utils/string") as typeof import("./utils/string")
	logger.error(e)
	client.snow.channel.createMessage("512869106089852949", {
		embeds: [
			{
				title: "Global error occured.",
				description: await text.stringify(e),
				color: 0xdd2d2d
			}
		]
	})
}

process.on("unhandledRejection", globalErrorHandler)
process.on("uncaughtException", globalErrorHandler)

require("./test.webserver")

// setup gateway

cloud.connect().catch((e) => logger.error(e, "gateway"))
logger.info("gateway started", "gateway")

cloud.on("error", (e) => logger.error(e, "gateway"))
cloud.on("event", d => {
	client.emit("gateway", d as import("discord-typings").GatewayPayload)
})

const queue = [] as Array<{ s_id: number, data: { op: number, d: unknown } }>

const presence = {} as import("discord-typings").GatewayPresenceUpdate

const gateway = {
	async postMessage(message: { o: number, d: unknown, t: string }): Promise<void> {

		if (message.o === constants.GATEWAY_WORKER_CODES.STATS) {
			const shards = Object.values(cloud.shardManager.shards)
			const data = { ram: process.memoryUsage(), uptime: process.uptime(), shards: shards.map(s => s.id), latency: shards.map(s => s.latency) }
			requester.consume({ d: data, t: message.t })

		} else if (message.o === constants.GATEWAY_WORKER_CODES.STATUS_UPDATE) {
			const packet = message.d as { status?: string; activities?: Array<import("discord-typings").Activity> }

			if (!packet.status && !packet.activities) return requester.consume({ d: presence, t: message.t })

			Object.assign(presence, packet)

			requester.consume({ d: presence, t: message.t })

			for (const shard of Object.values(cloud.shardManager.shards)) {
				if (shard.ready) shard.presenceUpdate(presence)
				else queue.push({ s_id: shard.id, data: { op: Constants.GATEWAY_OP_CODES.PRESENCE_UPDATE, d: presence } })
			}


		} else if (message.o === constants.GATEWAY_WORKER_CODES.SEND_MESSAGE) {
			const packet = message.d as { d: { guild_id: string }, op: number }
			const sid = Number((BigInt(packet.d.guild_id) >> BigInt(22)) % BigInt(config.total_shards))
			const shard = Object.values(cloud.shardManager.shards).find(s => s.id === sid)
			if (shard) {
				try {
					if (shard.ready) await shard.connector.betterWs?.sendMessage(message.d as import("cloudstorm").IWSMessage)
					else queue.push({ s_id: shard.id, data: packet })
				} catch {
					return requester.consume({ d: `Unable to send message:\n${JSON.stringify(message.d)}`, t: message.t })
				}
				requester.consume({ d: "Message sent", t: message.t })
			} else {
				logger.error(`No shard found to send WS Message:\n${util.inspect(message.d, true, 2, true)}`, "gateway")
				requester.consume({ d: `Unable to send message:\n${JSON.stringify(message.d)}`, t: message.t })
			}
		}
	}
}

passthrough.gateway = gateway as unknown as import("worker_threads").Worker

cloud.on("shardReady", async (d) => {
	if (!d.ready) return
	const squeue = queue.filter(i => i.s_id === d.id)
	const shards = Object.values(cloud.shardManager.shards)
	for (const q of squeue) {
		const shard = shards.find(s => s.id === d.id)
		if (shard) {
			try {
				await shard.connector.betterWs?.sendMessage(q.data as import("cloudstorm").IWSMessage)
				queue.splice(queue.indexOf(q), 1)
			} catch {
				return logger.error(`Unable to send message:\n${JSON.stringify(q)}`, "gateway")
			}
		} else logger.error(`No shard found to send WS Message:\n${util.inspect(q, true, 2, true)}`, "gateway")
	}

	if (shards.every(s => s.ready) && queue.length) logger.warn(`All shards are ready, but the queue still has entries in it.\n${util.inspect(queue)}`, "gateway")
})

cloud.on("error", (e) => logger.error(e, "gateway"))

client.once("ready", () => {
	tap.test("Main test", { autoend: false }, async test => {
		test.equal(client.ready, true, "client is ready")

		const TestUser = await client.snow.user.getUser("320067006521147393")
		test.equal(TestUser.username, "PapiOphidian", "fetch user")

		const AmandaUser = await client.snow.user.getUser("405208699313848330")
		test.equal(AmandaUser.username, "Amanda", "fetch self")

		test.end()

		setTimeout(() => {
			if (test.passing()) process.exit(0)
			else process.exit(1)
		}, 10000) // wait for interaction tests to finish
	})
})
