import http from "http"
import p from "path"

import { Manager } from "lavacord"
import * as ws from "ws"
import Sync from "heatsync"
import { Pool } from "pg"
import amqp from "amqplib"
import { SnowTransfer } from "snowtransfer"
import Frisky from "frisky-client"
import ListenSomeMoe from "listensomemoe"
import CommandManager from "../client/modules/CommandManager"

import passthrough from "../passthrough"
const config: import("../types").Config = require("../../config")
import constants from "../constants"


const sync = new Sync()
const rootFolder = p.join(__dirname, "../../webroot")
const configuredUserID = Buffer.from(config.bot_token.split(".")[0], "base64").toString("utf8")
const liveUserID = config.is_dev_env ? Buffer.from(config.live_bot_token.split(".")[0], "base64").toString("utf8") : configuredUserID
passthrough.snow = new SnowTransfer(config.bot_token, { disableEveryone: true })
const frisky = new Frisky()
const jp = new ListenSomeMoe(ListenSomeMoe.Constants.baseJPOPGatewayURL)
const kp = new ListenSomeMoe(ListenSomeMoe.Constants.baseKPOPGatewayURL)
const commands = new CommandManager<[import("discord-typings").Interaction, import("@amanda/lang").Lang, { shard_id: number; cluster_id: string }]>()
jp.on("error", console.error)
kp.on("error", console.error)
jp.on("unknown", console.info)
kp.on("unknown", console.info)

Object.assign(passthrough, { listenMoe: { jp, kp }, frisky, commands, constants })

const wss = new ws.Server({ noServer: true })
const queues: typeof import("../passthrough")["queues"] = new Map()
passthrough.joiningGuildShardMap = new Map<string, number>()

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

		const lavalinkNodeData = await db.query("SELECT * FROM lavalink_nodes").then(r => r.rows)
		const lavalinkNodes = lavalinkNodeData.map(node => {
			const newData = {
				password: config.lavalink_password,
				id: node.name.toLowerCase()
			}
			return Object.assign(newData, { host: node.host, port: node.port, invidious_origin: node.invidious_origin, name: node.name, search_with_invidious: node.search_with_invidious, enabled: node.enabled })
		})

		constants.lavalinkNodes.push(...lavalinkNodes)

		for (const node of constants.lavalinkNodes) {
			node.resumeKey = `${configuredUserID}/website`
			node.resumeTimeout = 75
		}

		passthrough.lavalink = new Manager(constants.lavalinkNodes.filter(n => n.enabled), {
			user: configuredUserID,
			shards: config.total_shards,
			send: async packet => {
				const url = await db.query("SELECT gateway_clusters.url FROM guilds INNER JOIN gateway_clusters ON guilds.cluster_id = gateway_clusters.cluster_id WHERE guilds.user_id = $1 AND guilds.guild_id = $2", [configuredUserID, packet.d.guild_id]).then(r => r.rows[0])
				if (!url) return false
				const shardID = passthrough.joiningGuildShardMap.get(packet.d.guild_id)
				if (!shardID) return false
				passthrough.joiningGuildShardMap.delete(packet.d.guild_id)
				const withSID = packet as typeof packet & { shard_id: number }
				withSID.shard_id = shardID

				await fetch(`${url.url}/voice-status-update`, { method: "POST", headers: { Authorization: config.bot_token }, body: JSON.stringify(withSID) })
				return true
			}
		})

		passthrough.lavalink.once("ready", () => console.log("Lavalink ready"))

		passthrough.lavalink.on("error", error => console.error(`There was a LavaLink error: ${error && (error as Error).message ? (error as Error).message : error}`))

		try {
			await passthrough.lavalink.connect()
		} catch (e) {
			console.error("There was a lavalink connect error. One of the nodes may be offline or unreachable")
		}
	}

	const connection = await amqp.connect(config.amqp_url)
	const channel = await connection.createChannel()
	await channel.assertQueue(config.amqp_queue, { durable: false, autoDelete: true })

	Object.assign(passthrough, { config, sync, rootFolder, configuredUserID, liveUserID, wss, queues, amqpChannel: channel })

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

		if (req.headers.authorization !== config.bot_token && req.url !== "/interaction") console.log(`${res.statusCode || "000"} ${req.method?.toUpperCase() || "UNK"} ${req.url} --- ${req.headers["x-forwarded-for"] || req.socket.remoteAddress}`, req.headers)
		if (!req.destroyed) req.destroy();
		if (!res.destroyed) res.destroy();
	})

	sync.require([
		"./music/music",
		"./music/playlist"
	])

	server.on("upgrade", async (req, socket, head) => {
		wss.handleUpgrade(req, socket, head, s => wss.emit("connection", s, req))
	})

	server.once("listening", () => console.log(`Server is listening on ${config.website_domain}`))

	server.listen(10400)

	wss.once("close", () => console.log("Socket server has closed."));

	process.on("uncaughtException", (e) => console.error(String(e)))
	process.on("unhandledRejection", (e) => console.error(String(e)))
})()
