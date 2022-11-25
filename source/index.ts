import path from "path"
import { Worker } from "worker_threads"

import "./utils/logger"

import CommandManager from "./modules/CommandManager"
import Frisky from "frisky-client"
import HeatSync from "heatsync"
import ListenSomeMoe from "listensomemoe"
import { Pool } from "pg"
import { SnowTransfer } from "snowtransfer"

import Amanda from "./modules/Amanda"
import ReconnectingWS from "./modules/ReconnectingWS"

const config = require("../config") as import("./types").Config // TypeScript WILL include files that use import in any way (type annotations or otherwise)
import constants from "./constants"
import passthrough from "./passthrough"

const snow = new SnowTransfer(config.bot_token, { disableEveryone: true })
const client = new Amanda(snow)
const commands = new CommandManager<[import("discord-typings").Interaction, import("@amanda/lang").Lang]>()
const frisky = new Frisky()
const jp = new ListenSomeMoe(ListenSomeMoe.Constants.baseJPOPGatewayURL)
const kp = new ListenSomeMoe(ListenSomeMoe.Constants.baseKPOPGatewayURL)
const sync = new HeatSync()

Object.assign(passthrough, { client, sync, config, constants, listenMoe: { jp, kp }, frisky, commands })

import { ThreadBasedReplier } from "./utils/classes/ThreadBasedReplier"
const requester = new ThreadBasedReplier()

const pool = new Pool({
	host: config.sql_domain,
	user: "amanda",
	password: config.sql_password,
	database: "main",
	max: 2
})

const GatewayWorker = new Worker(path.join(__dirname, "./discord-gateway.js"))

GatewayWorker.on("message", message => {
	if (message.o === constants.GATEWAY_WORKER_CODES.DISCORD) return client.emit("gateway", message.d)
	else return requester.consume(message)
})

sync.events.on("error", console.error)
sync.events.on("any", file => console.log(`${file} was changed`))
jp.on("error", console.error)
kp.on("error", console.error)
jp.on("unknown", console.info)
kp.on("unknown", console.info)
GatewayWorker.on("error", console.error)
client.snow.requestHandler.on("requestError", (p, e) => console.error(`Request Error:\n${p}\n${e}`))

;(async () => {
	if (config.db_enabled) {
		const db = await pool.connect()
		await db.query({ text: "SELECT * FROM premium LIMIT 1" })
		console.log("Connected to database")
		passthrough.db = db
	} else console.warn("Database disabled")

	let firstConnect = true
	const onOpen = () => {
		if (firstConnect) console.log("Website socket ready")
		firstConnect = false
		passthrough.websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.IDENTIFY, d: { token: config.lavalink_password, timestamp: Date.now() } }))
	}
	const websiteSocket = new ReconnectingWS(`ws${config.website_ipc_bind !== "localhost" ? "s" : ""}://${config.website_ipc_bind}:${config.website_domain.split(":")[1] || "10400"}`, 5000)
	websiteSocket.on("open", onOpen)
	websiteSocket.on("close", (code: number, reason: Buffer) => console.warn(`Website socket disconnect: { code: ${code}, reason: ${reason.toString("utf8")} }`))

	Object.assign(passthrough, { requester, gateway: GatewayWorker, websiteSocket })

	import("./modules/stdin")

	sync.require([
		"./modules/EventManager",
		"./commands/hidden",
		"./commands/images",
		"./commands/interaction",
		"./commands/music/music",
		"./commands/music/playlist",
		"./commands/meta", // meta should load last always for command docs reasons
		"./commands/status"
	])
})()

async function globalErrorHandler(e: Error | undefined) {
	const text = require("./utils/string") as typeof import("./utils/string")
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
