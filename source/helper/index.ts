import { SnowTransfer } from "snowtransfer"
import { Client as CloudStorm } from "cloudstorm"
import HeatSync = require("heatsync")
const sync = new HeatSync()
sync.require("../logger")

import passthrough = require("../passthrough")
const config: typeof import("../../config.sample") = sync.require("../../config")
const snow = new SnowTransfer(config.helper_bot_token, { disableEveryone: true })
const cloud = new CloudStorm(config.helper_bot_token, {
	intents: ["GUILD_MEMBERS"],
	ws: {
		compress: false,
		encoding: "json"
	}
})
Object.assign(passthrough, { sync, config, snow })

const setup: typeof import("./setup") = sync.require("./setup")

;(async () => {
	if (config.db_enabled) await setup.setupPg()
	else console.warn("Database disabled")

	await cloud.connect()
	cloud.on("dispatch", event => setup.onDispatch(event))
	console.log(`Ready and listening to guild ${config.premium_guild_id} for members to receive role ${config.premium_role_id}`)
})()

process.on("unhandledRejection", e => setup.onGlobalError(e))
process.on("uncaughtException", e => setup.onGlobalError(e))
