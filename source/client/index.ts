import "../logger"

import HeatSync from "heatsync"
import { Pool } from "pg"
import { SnowTransfer } from "snowtransfer"
import amqp from "amqplib"

import Amanda from "./Amanda"
import CommandManager from "../CommandManager"

const config: import("../types").Config = require("../../config") // TypeScript WILL include files that use import in any way (type annotations or otherwise)
import constants from "../constants"
import passthrough from "../passthrough"

const clientID = Buffer.from(config.bot_token.split(".")[0], "base64").toString("utf8")
passthrough.configuredUserID = clientID

const snow = new SnowTransfer(config.bot_token, { disableEveryone: true })
const client = new Amanda(snow)
const commands = new CommandManager<[import("../Command"), import("@amanda/lang").Lang, { shard_id: number; cluster_id: string }]>()
const sync = new HeatSync()

Object.assign(passthrough, { client, sync, config, constants, commands })

const pool = new Pool({
	host: config.sql_domain,
	user: config.sql_user,
	password: config.sql_password,
	database: "main",
	max: 2
})

sync.events.on("error", console.error)
sync.events.on("any", file => console.log(`${file} was changed`))
client.snow.requestHandler.on("requestError", (p, e) => console.error(`Request Error:\n${p}\n${e}`))

;(async () => {
	if (config.db_enabled) {
		const db = await pool.connect()
		await db.query({ text: "SELECT * FROM premium LIMIT 1" })
		console.log("Connected to database")
		passthrough.db = db
	} else console.warn("Database disabled")

	if (config.amqp_enabled) {
		const connection = await amqp.connect(config.amqp_url)
		const channel = await connection.createChannel()
		await channel.assertQueue(config.amqp_queue, { durable: false, autoDelete: true })
		Object.assign(passthrough, { amqpChannel: channel })

		channel.consume(config.amqp_queue, async msg => {
			if (!msg) return
			channel.ack(msg)
			const parsed: import("discord-api-types/v10").GatewayDispatchPayload & { shard_id: number; cluster_id: string } = JSON.parse(msg.content.toString("utf-8"))
			// -1 s means it was an interaction sent from website and this path is for bots still using gateway interactions
			if (parsed.s !== -1 && parsed.t === "INTERACTION_CREATE" && (parsed.d.type === 2 || parsed.d.type === 3)) {
				await client.snow.interaction.createInteractionResponse(parsed.d.id, parsed.d.token, { type: parsed.d.type === 2 ? 5 : 6 })
				if (parsed.d.type === 2 && ["play", "radio", "skip", "stop", "queue", "nowplaying", "trackinfo", "lyrics", "seek", "filters", "shuffle", "musictoken", "playlists"].includes(parsed.d.data.name)) return channel.sendToQueue(config.amqp_music_queue, msg.content)
			}
			client.emit("gateway", parsed)
		})

		channel.on("close", console.error)
	}

	const discordUtils: typeof import("./utils/discord") = await sync.require("./utils/discord")
	let clientUser = await discordUtils.getUser(clientID)
	if (!clientUser) clientUser = { id: clientID, username: "Amanda detached", discriminator: "0000", avatar: null }
	client.user = clientUser

	process.title = client.user.username

	sync.require([
		"./stdin",
		"./EventManager",
		"./commands/hidden",
		"./commands/images",
		"./commands/interaction",
		"./commands/money",
		"./commands/music-stub",
		"./commands/meta" // meta should load last always for command docs reasons
	])
	console.log(`Successfully logged in as ${client.user.username}`)
})()

async function globalErrorHandler(e: Error | undefined) {
	const text: typeof import("./utils/string") = require("./utils/string")
	console.error(e)
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
