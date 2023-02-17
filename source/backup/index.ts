import HeatSync = require("heatsync")
const sync = new HeatSync()
sync.require("../logger")

import passthrough = require("../passthrough")
const config: typeof import("../../config.sample") = sync.require("../../config")
const constants: typeof import("../constants") = sync.require("../constants")
Object.assign(passthrough, { sync, config, constants })

const setup: typeof import("./setup") = sync.require("./setup")

;(async () => {
	if (config.db_enabled) await setup.setupPg()
	else console.warn("Database disabled")

	setup.setTimeoutForBackup()
})()

process.on("unhandledRejection", e => setup.onGlobalError(e))
process.on("uncaughtException", e => setup.onGlobalError(e))
