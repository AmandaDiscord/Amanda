/* eslint-disable @typescript-eslint/ban-ts-comment */

// this file is hot reloadable
import path = require("path")

import { Pool } from "pg"
import amqp = require("amqplib")
import { Manager } from "lavacord"

import passthrough = require("../passthrough")
const { sync, config, snow, constants } = passthrough

const setConfiguredUserID = () => passthrough.configuredUserID = Buffer.from(config.bot_token.split(".")[0], "base64").toString("utf8")
setConfiguredUserID()

sync.addTemporaryListener(sync.events, "error", console.error)
sync.addTemporaryListener(sync.events, "any", file => console.log(`${file} was changed`))
sync.addTemporaryListener(snow.requestHandler, "requestError", (p, e) => console.error(`Request Error:\n${p}\n${e}`))

const nodes: typeof constants["lavalinkNodes"] = constants.lavalinkNodes.length > 1 ? constants.lavalinkNodes : [] // for reloading constants

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

	async setupAmqp() {
		const connection = await amqp.connect(config.amqp_url)
		const channel = await connection.createChannel()
		await channel.assertQueue(config.amqp_music_queue, { durable: false, autoDelete: true })
		await channel.assertQueue(config.amqp_website_queue, { durable: false, autoDelete: true })
		console.log("Connected to AMQP")
		passthrough.amqpChannel = channel

		const eventHandler: typeof import("./EventManager") = sync.require("./EventManager")
		const syncedSetup: typeof import("./setup") = sync.require("./setup")
		channel.consume(config.amqp_music_queue, msg => syncedSetup.onAmqpMessage(channel, msg, eventHandler))
		channel.once("close", (...params) => syncedSetup.onAmqpChannelClose(...params))
	},

	async disconnectAmqp() {
		await passthrough.amqpChannel.connection.close().then(() => console.warn("AMQP disabled")).catch(console.error)
		// @ts-ignore
		delete passthrough.amqpChannel
	},

	onAmqpMessage(channel: import("amqplib").Channel, msg: import("amqplib").ConsumeMessage | null, eventHandler: typeof import("./EventManager")) {
		if (!msg) return
		channel.ack(msg)
		const parsed = JSON.parse(msg.content.toString("utf-8"))
		eventHandler.handle(parsed)
	},

	onAmqpChannelClose(...params: Array<any>) {
		console.error(...params)
	},

	async setupLavalink() {
		if (!passthrough.db) return
		const lavalinkNodeData = await passthrough.db.query("SELECT * FROM lavalink_nodes").then(r => r.rows)
		const lavalinkNodes = lavalinkNodeData.map(node => {
			const newData = {
				password: config.lavalink_password,
				id: node.name.toLowerCase()
			}
			return Object.assign(newData, { host: node.host, port: node.port, invidious_origin: node.invidious_origin, name: node.name, search_with_invidious: node.search_with_invidious, enabled: node.enabled })
		})

		nodes.push(...lavalinkNodes)
		constants.lavalinkNodes.push(...lavalinkNodes)

		for (const node of constants.lavalinkNodes) {
			node.resumeKey = `${passthrough.configuredUserID}/music_worker`
			node.resumeTimeout = 75
		}

		const syncedSetup: typeof import("./setup") = sync.require("./setup")

		passthrough.lavalink = new Manager(constants.lavalinkNodes.filter(n => n.enabled), {
			user: passthrough.configuredUserID,
			shards: config.total_shards,
			send: packet => syncedSetup.sendLavalinkPacket(packet)
		})

		passthrough.lavalink.once("ready", () => console.log("Lavalink ready"))

		passthrough.lavalink.on("error", error => console.error(`There was a LavaLink error: ${error && (error as Error).message ? (error as Error).message : error}`))

		try {
			await passthrough.lavalink.connect()
		} catch (e) {
			console.error("There was a lavalink connect error. One of the nodes may be offline or unreachable\n", e)
		}
	},

	async sendLavalinkPacket(packet: import("lavacord").DiscordPacket) {
		const url = await passthrough.db?.query("SELECT gateway_clusters.url, guilds.shard_id FROM guilds INNER JOIN gateway_clusters ON guilds.cluster_id = gateway_clusters.cluster_id WHERE guilds.client_id = $1 AND guilds.guild_id = $2", [passthrough.configuredUserID, packet.d.guild_id]).then(r => r.rows[0])
		if (!url) return false
		const withSID = packet.d
		withSID.shard_id = url.shard_id

		await fetch(`${url.url}/gateway/voice-status-update`, { method: "POST", headers: { Authorization: config.bot_token }, body: JSON.stringify(withSID) })
		return true
	},

	loadCommands() {
		sync.require([
			"./stdin",
			"./music",
			"./playlist"
		])
	},

	async onGlobalError(e: any) {
		console.error(e)
		snow.channel.createMessage("512869106089852949", {
			embeds: [
				{
					title: "Global music error occured.",
					description: await require("../client/utils/string").stringify(e),
					color: 0xdd2d2d
				}
			]
		})
	}
}

sync.addTemporaryListener(sync.events, path.join(__dirname, "../constants.js"), () => constants.lavalinkNodes.push(...nodes))
sync.addTemporaryListener(sync.events, path.join(__dirname, "../../config.js"), () => {
	setConfiguredUserID()
	const newToken = `Bot ${config.bot_token}`
	if (snow.token !== newToken) {
		console.warn("Client token changed")
		snow.token = newToken
	}

	if (config.db_enabled && !passthrough.db) setup.setupPg()
	else if (!config.db_enabled && passthrough.pool) setup.disconnectPg()

	if (config.amqp_enabled && !passthrough.amqpChannel) setup.setupAmqp()
	else if (!config.amqp_enabled && passthrough.amqpChannel) setup.disconnectAmqp()
})

export = setup
