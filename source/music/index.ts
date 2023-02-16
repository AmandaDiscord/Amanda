import HeatSync = require("heatsync")
import { SnowTransfer } from "snowtransfer"
const sync = new HeatSync()
sync.require("../logger")

import passthrough = require("../passthrough")
import CommandManager = require("../CommandManager")
const config: typeof import("../../config") = sync.require("../../config")
const constants: typeof import("../constants") = sync.require("../constants")
const snow = new SnowTransfer(config.bot_token, { disableEveryone: true })
const commands = new CommandManager<[import("../Command"), import("@amanda/lang").Lang]>()
const queues = new Map<string, import("./queue").Queue>()
Object.assign(passthrough, { snow, sync, config, constants, commands, queues })


const setup: typeof import("./setup") = sync.require("./setup")

;(async () => {
	if (config.db_enabled) {
		await setup.setupPg()
		await setup.setupLavalink()
	} else console.warn("Database disabled")

	if (config.amqp_enabled) await setup.setupAmqp()
	else console.warn("AMQP disabled")

	setup.loadCommands()
})()

process.on("unhandledRejection", e => setup.onGlobalError(e))
process.on("uncaughtException", e => setup.onGlobalError(e))
