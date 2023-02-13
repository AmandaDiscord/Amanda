import "../logger"

import http from "http"
import p from "path"

import * as ws from "ws"
import Sync from "heatsync"
import { Pool } from "pg"
import amqp from "amqplib"

import passthrough from "../passthrough"
const config: import("../types").Config = require("../../config")
import constants from "../constants"


const sync = new Sync()
const rootFolder = p.join(__dirname, "../../webroot")
const configuredUserID = Buffer.from(config.bot_token.split(".")[0], "base64").toString("utf8")
const liveUserID = config.is_dev_env ? Buffer.from(config.live_bot_token.split(".")[0], "base64").toString("utf8") : configuredUserID
const webQueues = new Map<string, import("../types").WebQueue>()

Object.assign(passthrough, { constants, webQueues })

const wss = new ws.Server({ noServer: true })
const queues: typeof import("../passthrough")["queues"] = new Map()

;(async () => {
	if (config.db_enabled) {
		const pool = new Pool({
			host: config.sql_domain,
			user: "amanda",
			password: config.sql_password,
			database: "main",
			max: 2
		})

		const db = await pool.connect()
		await db.query({ text: "DELETE FROM csrf_tokens WHERE expires < $1", values: [Date.now()] })
		passthrough.db = db
	}

	if (config.amqp_enabled) {
		const connection = await amqp.connect(config.amqp_url)
		const channel = await connection.createChannel()
		await channel.assertQueue(config.amqp_queue, { durable: false, autoDelete: true })
		await channel.assertQueue(config.amqp_website_queue, { durable: false, autoDelete: true })

		Object.assign(passthrough, { amqpChannel: channel })
		channel.on("close", console.error)
	}

	Object.assign(passthrough, { config, sync, rootFolder, configuredUserID, liveUserID, wss, queues })

	const paths: typeof import("./paths") = sync.require("./paths")
	const util: typeof import("./util") = sync.require("./util")
	import("./api")

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url!, `${config.website_protocol}://${req.headers.host}`)
			const path = paths[url.pathname]
			if (path) {
				if (req.method?.toUpperCase() === "OPTIONS") res.writeHead(204, { "Allow": path.methods.join(", ") })
				else if (!path.methods.includes(req.method?.toUpperCase()!)) res.writeHead(405).end()
				else if (req.headers["range"]) res.writeHead(416).end()
				else if (req.headers["expect"]) res.writeHead(417).end()
				else {
					if (path.static) await util.streamResponse(res, p.join(rootFolder, path.static), req.method?.toUpperCase() === "HEAD")
					else if (path.handle) await path.handle(req, res, url)
					else res.writeHead(500).end()
				}
			} else await util.streamResponse(res, p.join(rootFolder, url.pathname))
		} catch (e) {
			console.error(e)
			if (res.writable) res.writeHead(500, { "Content-Type": "text/plain" }).end(String(e))
		}

		if (req.headers.cookie) delete req.headers.cookie

		if (res.statusCode >= 300) console.log(`${res.statusCode || "000"} ${req.method?.toUpperCase() || "UNK"} ${req.url} --- ${req.headers["x-forwarded-for"] || req.socket.remoteAddress}`, req.headers)
		if (!req.destroyed) req.destroy()
		if (!res.destroyed) res.destroy()
	})

	server.on("upgrade", async (req, socket, head) => {
		wss.handleUpgrade(req, socket, head, s => wss.emit("connection", s, req))
	})

	server.once("listening", () => console.log(`Server is listening on ${config.website_domain}`))

	server.listen(10400)

	wss.once("close", () => console.log("Socket server has closed."))
	require("./music")

	process.on("uncaughtException", globalErrorHandler)
	process.on("unhandledRejection", globalErrorHandler)
})()

async function globalErrorHandler(e: Error | undefined) {
	const text: typeof import("../client/utils/string") = require("../client/utils/string")
	console.error(await text.stringify(e))
}
