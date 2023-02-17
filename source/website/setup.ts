// this file is hot reloadable
import p = require("path")

import { Pool } from "pg"
import amqp = require("amqplib")

import passthrough = require("../passthrough")
const { sync, config, rootFolder, constants, webQueues, sessions } = passthrough

const setConfiguredUserID = () => {
	passthrough.configuredUserID = Buffer.from(config.bot_token.split(".")[0], "base64").toString("utf8")
	passthrough.liveUserID = config.is_dev_env ? Buffer.from(config.live_bot_token.split(".")[0], "base64").toString("utf8") : passthrough.configuredUserID
}
setConfiguredUserID()

sync.addTemporaryListener(sync.events, "error", console.error)
sync.addTemporaryListener(sync.events, "any", file => console.log(`${file} was changed`))

const setup = {
	async setupPg() {
		const pool = new Pool({ host: config.sql_domain, user: config.sql_user, password: config.sql_password, database: "main", max: 2 })
		const db = await pool.connect().catch(e => void console.error(e))
		if (!db) return
		await db.query({ text: "SELECT * FROM premium LIMIT 1" })

		console.log("Connected to database")
		passthrough.pool = pool
		passthrough.db = db
	},

	async disconnectPg() {
		await passthrough.pool.end().then(() => console.warn("Database disabled")).catch(console.error)
		// @ts-ignore
		delete passthrough.db; delete passthrough.pool
	},

	async setupAmqp(music: typeof import("./music")) { // dont require music handler in here as it should run independent of amqp
		const connection = await amqp.connect(config.amqp_url)
		const channel = await connection.createChannel()
		await channel.assertQueue(config.amqp_queue, { durable: false, autoDelete: true })
		await channel.assertQueue(config.amqp_music_queue, { durable: false, autoDelete: true })
		await channel.assertQueue(config.amqp_website_queue, { durable: false, autoDelete: true })
		console.log("Connected to AMQP")
		passthrough.amqpChannel = channel

		const syncedSetup: typeof import("./setup") = sync.require("./setup")
		channel.consume(config.amqp_website_queue, msg => syncedSetup.onAmqpMessage(channel, msg, music))
		channel.once("close", (...params) => syncedSetup.onAmqpChannelClose(...params))
	},

	async disconnectAmqp() {
		await passthrough.amqpChannel.connection.close().then(() => console.warn("AMQP disabled")).catch(console.error)
		// @ts-ignore
		delete passthrough.amqpChannel
	},

	onAmqpMessage(channel: import("amqplib").Channel, msg: import("amqplib").ConsumeMessage | null, music: typeof import("./music")) {
		if (!msg) return
		channel.ack(msg)
		const parsed = JSON.parse(msg.content.toString("utf-8"))

		if (parsed.op === constants.WebsiteOPCodes.ACCEPT) {
			const queue = webQueues.get(parsed.d?.channel_id!)
			if (parsed.d && parsed.d.op && queue) {
				music.receivers[parsed.d.op]?.updateCallback(queue, parsed.d.d)
				const subscribers = sessions.filter(s => s.channel === parsed.d!.channel_id)
				for (const subscriber of subscribers) {
					music.receivers[parsed.d.op]?.sessionCallback(subscriber, queue, parsed.d.d)
				}
			}


		} else if (parsed.op === constants.WebsiteOPCodes.CREATE) {
			if (parsed.d && parsed.d.voiceChannel && parsed.d.voiceChannel.id && !webQueues.has(parsed.d.voiceChannel.id)) {
				webQueues.set(parsed.d.voiceChannel.id, parsed.d)
				const subscribers = sessions.filter(s => s.channel === parsed.d!.voiceChannel.id)
				for (const subscriber of subscribers) {
					subscriber.sendState({})
				}
			}
		}
	},

	onAmqpChannelClose(...params: Array<unknown>) {
		console.error(...params)
	},

	async onIncomingRequest(req: import("http").IncomingMessage, res: import("http").ServerResponse, paths: typeof import("./paths"), util: typeof import("./util")) {
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
			if (res.writable) res.writeHead(500, { "Content-Type": "text/plain" }).end("Something happened on our end. Oops!")
		}

		if (req.headers.cookie) delete req.headers.cookie

		if (res.statusCode >= 300) console.log(`${res.statusCode || "000"} ${req.method?.toUpperCase() || "UNK"} ${req.url} ---`, req.headers["x-forwarded-for"] || req.socket.remoteAddress, req.headers)
		if (!req.destroyed) req.destroy()
		if (!res.destroyed) res.destroy()
	},

	async onGlobalError(e: unknown) {
		console.error(await require("../client/utils/string").stringify(e))
	}
}

sync.addTemporaryListener(sync.events, p.join(__dirname, "../../config.js"), () => {
	setConfiguredUserID()

	if (config.db_enabled && !passthrough.db) setup.setupPg()
	else if (!config.db_enabled && passthrough.pool) setup.disconnectPg()

	if (config.amqp_enabled && !passthrough.amqpChannel) {
		const music: typeof import("./music") = sync.require("./music")
		setup.setupAmqp(music)
	} else if (!config.amqp_enabled && passthrough.amqpChannel) setup.disconnectAmqp()
})

export = setup
