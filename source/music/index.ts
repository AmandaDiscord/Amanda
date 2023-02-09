import "../logger"

import util from "util"

import HeatSync from "heatsync"
import { Pool } from "pg"
import { SnowTransfer } from "snowtransfer"
import amqp from "amqplib"
import { Manager } from "lavacord"
// import Frisky from "frisky-client"
// import ListenSomeMoe from "listensomemoe"

import CommandManager from "../CommandManager"

const config: import("../types").Config = require("../../config") // TypeScript WILL include files that use import in any way (type annotations or otherwise)
import constants from "../constants"
import passthrough from "../passthrough"

const clientID = Buffer.from(config.bot_token.split(".")[0], "base64").toString("utf8")
passthrough.configuredUserID = clientID

const snow = new SnowTransfer(config.bot_token, { disableEveryone: true })
const commands = new CommandManager<[import("../Command"), import("@amanda/lang").Lang]>()
const sync = new HeatSync()
const queues = new Map<string, import("./queue").Queue>()
/* const frisky = new Frisky()
const jp = new ListenSomeMoe(ListenSomeMoe.Constants.baseJPOPGatewayURL)
const kp = new ListenSomeMoe(ListenSomeMoe.Constants.baseKPOPGatewayURL)
jp.on("error", console.error)
kp.on("error", console.error)
jp.on("unknown", console.info)
kp.on("unknown", console.info)
*/

Object.assign(passthrough, { snow, sync, config, constants, commands, queues/* , listenMoe: { jp, kp }, frisky */ })

const pool = new Pool({
	host: config.sql_domain,
	user: "amanda",
	password: config.sql_password,
	database: "main",
	max: 2
})

sync.events.on("error", console.error)
sync.events.on("any", file => console.log(`${file} was changed`))
snow.requestHandler.on("requestError", (p, e) => console.error(`Request Error:\n${p}\n${e}`))

;(async () => {
	if (config.db_enabled) {
		const db = await pool.connect()
		await db.query({ text: "SELECT * FROM premium LIMIT 1" })
		console.log("Connected to database")
		passthrough.db = db

		const lavalinkNodeData = await passthrough.db.query("SELECT * FROM lavalink_nodes").then(r => r.rows)
		const lavalinkNodes = lavalinkNodeData.map(node => {
			const newData = {
				password: config.lavalink_password,
				id: node.name.toLowerCase()
			}
			return Object.assign(newData, { host: node.host, port: node.port, invidious_origin: node.invidious_origin, name: node.name, search_with_invidious: node.search_with_invidious, enabled: node.enabled })
		})

		constants.lavalinkNodes.push(...lavalinkNodes)


		for (const node of constants.lavalinkNodes) {
			node.resumeKey = `${clientID}/music_worker`
			node.resumeTimeout = 75
		}

		passthrough.lavalink = new Manager(constants.lavalinkNodes.filter(n => n.enabled), {
			user: clientID,
			shards: config.total_shards,
			send: async packet => {
				const url = await passthrough.db.query("SELECT gateway_clusters.url, guilds.shard_id FROM guilds INNER JOIN gateway_clusters ON guilds.cluster_id = gateway_clusters.cluster_id WHERE guilds.client_id = $1 AND guilds.guild_id = $2", [clientID, packet.d.guild_id]).then(r => r.rows[0])
				if (!url) return false
				const withSID = packet.d
				withSID.shard_id = url.shard_id

				await fetch(`${url.url}/gateway/voice-status-update`, { method: "POST", headers: { Authorization: config.bot_token }, body: JSON.stringify(withSID) })
				return true
			}
		})

		passthrough.lavalink.once("ready", () => console.log("Lavalink ready"))

		passthrough.lavalink.on("error", error => console.error(`There was a LavaLink error: ${error && (error as Error).message ? (error as Error).message : error}`))

		try {
			await passthrough.lavalink!.connect()
		} catch (e) {
			console.error("There was a lavalink connect error. One of the nodes may be offline or unreachable")
		}
	} else console.warn("Database disabled")

	const connection = await amqp.connect(config.amqp_url)
	const channel = await connection.createChannel()
	await channel.assertQueue(config.amqp_music_queue, { durable: false, autoDelete: true })
	await channel.assertQueue(config.amqp_website_queue, { durable: false, autoDelete: true })

	Object.assign(passthrough, { amqpChannel: channel })

	const eventHandler: typeof import("./EventManager") = sync.require("./EventManager")

	channel.consume(config.amqp_music_queue, msg => {
		if (!msg) return
		channel.ack(msg)
		const parsed = JSON.parse(msg.content.toString("utf-8"))
		eventHandler.handle(parsed)
	})

	sync.require([
		"./stdin",
		"./music",
		"./playlist"
	])
})()

function globalErrorHandler(e: Error | undefined) {
	console.error(e)
	snow.channel.createMessage("512869106089852949", {
		embeds: [
			{
				title: "Global error occured.",
				description: util.inspect(e),
				color: 0xdd2d2d
			}
		]
	})
}

process.on("unhandledRejection", globalErrorHandler)
process.on("uncaughtException", globalErrorHandler)
