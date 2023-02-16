import HeatSync = require("heatsync")
const sync = new HeatSync()
sync.require("../logger")

import http = require("http")
import p = require("path")
import ws = require("ws")

import passthrough = require("../passthrough")
const config: typeof import("../../config.sample") = sync.require("../../config")
const constants: typeof import("../constants") = sync.require("../constants")
const rootFolder = p.join(__dirname, "../../webroot")
const webQueues = new Map<string, import("../types").WebQueue>()
const wss = new ws.Server({ noServer: true })
const sessions = [] as Array<typeof import("./music")["Session"]["prototype"]>
Object.assign(passthrough, { sync, config, constants, rootFolder, webQueues, wss, sessions })

const setup: typeof import("./setup") = sync.require("./setup")

;(async () => {
	if (config.db_enabled) await setup.setupPg()
	else console.warn("Database disabled")

	const music: typeof import("./music") = sync.require("./music")

	if (config.amqp_enabled) await setup.setupAmqp(music)
	else console.warn("AMQP disabled")

	const paths: typeof import("./paths") = sync.require("./paths")
	const util: typeof import("./util") = sync.require("./util")

	sync.require("./api")

	const server = http.createServer((req, res) => setup.onIncomingRequest(req, res, paths, util))

	server.on("upgrade", async (req, socket, head) => {
		wss.handleUpgrade(req, socket, head, s => wss.emit("connection", s, req))
	})

	server.once("listening", () => console.log(`Server is listening on ${config.website_domain}`))

	server.listen(10400)

	wss.once("close", () => console.log("Socket server has closed."))
})()

process.on("uncaughtException", e => setup.onGlobalError(e))
process.on("unhandledRejection", e => setup.onGlobalError(e))
