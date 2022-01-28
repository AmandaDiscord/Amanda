import path from "path"
import { Worker } from "worker_threads"

import CommandManager from "@amanda/commandmanager"
import Frisky from "frisky-client"
import { handle } from "thunderstorm"
import HeatSync from "heatsync"
import ListenSomeMoe from "listensomemoe"
import { Pool } from "pg"
import { SnowTransfer } from "snowtransfer"
import Taihou from "taihou"

import Amanda from "./modules/Amanda"

const config = require("../config") as import("./types").Config // TypeScript WILL include files that use import in any way (type annotations or otherwise)
import constants from "./constants"
import passthrough from "./passthrough"

const snow = new SnowTransfer(config.bot_token, { disableEveryone: true })
const client = new Amanda({ snowtransfer: snow, disableEveryone: true })
const commands = new CommandManager<[import("thunderstorm").CommandInteraction, import("@amanda/lang").Lang]>()
const frisky = new Frisky()
const jp = new ListenSomeMoe(ListenSomeMoe.Constants.baseJPOPGatewayURL)
const kp = new ListenSomeMoe(ListenSomeMoe.Constants.baseKPOPGatewayURL)
const sync = new HeatSync()
const weebsh = new Taihou(config.weeb_api_key, true, { userAgent: config.weeb_identifier })

Object.assign(passthrough, { client, sync, config, constants, listenMoe: { jp, kp }, weebsh, frisky, commands })
const logger = sync.require("./utils/logger") as typeof import("./utils/logger")

import ThreadBasedReplier from "./utils/classes/ThreadBasedReplier"
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
	if (message.o === constants.GATEWAY_WORKER_CODES.DISCORD) return handle(message.d, client)
	else return requester.consume(message)
})

sync.events.on("error", logger.error)
sync.events.on("any", file => logger.info(`${file} was changed`))
jp.on("error", logger.error)
kp.on("error", logger.error)
jp.on("unknown", logger.info)
kp.on("unknown", logger.info)
GatewayWorker.on("error", logger.error)
client._snow.requestHandler.on("requestError", (p, e) => logger.error(`Request Error:\n${p}\n${e}`))

;(async () => {
	const db = await pool.connect()
	await db.query({ text: "SELECT * FROM premium LIMIT 1" })
	logger.info("Connected to database")
	import("./modules/stdin")

	Object.assign(passthrough, { db, requester, gateway: GatewayWorker })

	sync.require([
		"./modules/EventManager",
		"./commands/couples",
		"./commands/hidden",
		"./commands/images",
		"./commands/interaction",
		"./commands/music/music",
		"./commands/meta", // meta should load last always for command docs reasons
		"./commands/status"
	])
})()

process.on("unhandledRejection", (e) => logger.error(e))
process.on("uncaughtException", (e) => logger.error(e))
