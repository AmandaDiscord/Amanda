import { EventEmitter } from "events"
import path from "path"
import { Worker } from "worker_threads"

import Frisky from "frisky-client"
import HeatSync from "heatsync"
import ListenSomeMoe from "listensomemoe"
import { Pool } from "pg"
import { SnowTransfer } from "snowtransfer"
import Taihou from "taihou"
import { handle } from "thunderstorm"

import Amanda from "./modules/Amanda"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require("../config") as import("./types").Config // TypeScript WILL include files that use import in any way (type annotations or otherwise)
import constants from "./constants"
import passthrough from "./passthrough"

const snow = new SnowTransfer(config.bot_token, { disableEveryone: true })
const client = new Amanda({ snowtransfer: snow, disableEveryone: true })
const sync = new HeatSync()
const jp = new ListenSomeMoe(ListenSomeMoe.Constants.baseJPOPGatewayURL)
const kp = new ListenSomeMoe(ListenSomeMoe.Constants.baseKPOPGatewayURL)
const weebsh = new Taihou(config.weeb_api_key, true, { userAgent: config.weeb_identifier })
const internalEvents = new EventEmitter() as import("./types").internalEvents
const frisky = new Frisky()

Object.assign(passthrough, { client, sync, config, constants, jp, kp, weebsh, internalEvents, frisky })
import("./modules/stdin")
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
	logger.info(message.d)
	if (message.o === "DISCORD") return handle(message.d, client)
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
client.on("raw", logger.info)

;(async () => {
	const db = await pool.connect()
	logger.info("Connected to database")

	await db.query({ text: "DELETE FROM voice_states WHERE guild_id IN (SELECT id FROM guilds WHERE added_by = $1)", values: [config.cluster_id] })
	logger.info("Deleted all voice states in cluster")

	Object.assign(passthrough, { db, requester })
})()
