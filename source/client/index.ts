import HeatSync = require("heatsync")
import { SnowTransfer } from "snowtransfer"
const sync = new HeatSync()
sync.require("../logger")

import passthrough = require("../passthrough")
import Amanda = require("./Amanda")
import CommandManager = require("../CommandManager")
const config: typeof import("../../config") = sync.require("../../config")
const constants: typeof import("../constants") = sync.require("../constants")
const snow = new SnowTransfer(config.bot_token, { disableEveryone: true })
const client = new Amanda(snow)
const commands = new CommandManager<[import("../Command"), import("@amanda/lang").Lang, { shard_id: number; cluster_id: string }]>()
Object.assign(passthrough, { sync, config, constants, client, commands })

const setup: typeof import("./setup") = sync.require("./setup")

;(async () => {
	if (config.db_enabled) await setup.setupPg()
	else console.warn("Database disabled")

	if (config.amqp_enabled) await setup.setupAmqp()
	else console.warn("AMQP disabled")

	await setup.setupClient()
	console.log(`Successfully logged in as ${client.user.username}#${client.user.discriminator}`)

	setup.loadCommands()
})()

process.on("unhandledRejection", e => setup.onGlobalError(e))
process.on("uncaughtException", e => setup.onGlobalError(e))
