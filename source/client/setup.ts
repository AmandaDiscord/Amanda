/* eslint-disable @typescript-eslint/ban-ts-comment */

// this file is hot reloadable
import path = require("path")

import { Pool } from "pg"
import amqp = require("amqplib")

import passthrough = require("../passthrough")
const { sync, config, client } = passthrough

const setConfiguredUserID = () => passthrough.configuredUserID = Buffer.from(config.bot_token.split(".")[0], "base64").toString("utf8")
setConfiguredUserID()

sync.addTemporaryListener(sync.events, "error", console.error)
sync.addTemporaryListener(sync.events, "any", file => console.log(`${file} was changed`))
sync.addTemporaryListener(client.snow.requestHandler, "requestError", (p, e) => console.error(`Request Error:\n${p}\n${e}`))

const musicCommands = ["play", "radio", "skip", "stop", "queue", "nowplaying", "trackinfo", "lyrics", "seek", "filters", "shuffle", "musictoken", "playlists"]

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

	async setupClient() {
		let clientUser = await require("./utils/discord").getUser(passthrough.configuredUserID).catch(() => void 0)
		if (!clientUser) clientUser = { id: passthrough.configuredUserID, username: "Amanda detached", discriminator: "0000", avatar: null }
		client.user = clientUser
		process.title = client.user.username
		return client
	},

	async setupAmqp() {
		const connection = await amqp.connect(config.amqp_url)
		const channel = await connection.createChannel()
		await channel.assertQueue(config.amqp_queue, { durable: false, autoDelete: true })
		await channel.assertQueue(config.amqp_music_queue, { durable: false, autoDelete: true })
		console.log("Connected to AMQP")
		passthrough.amqpChannel = channel

		const syncedSetup: typeof import("./setup") = sync.require("./setup")
		channel.consume(config.amqp_queue, msg => syncedSetup.onAmqpMessage(channel, msg))
		channel.once("close", (...params) => syncedSetup.onAmqpChannelClose(...params))
	},

	async disconnectAmqp() {
		await passthrough.amqpChannel.connection.close().then(() => console.warn("AMQP disabled")).catch(console.error)
		// @ts-ignore
		delete passthrough.amqpChannel
	},

	async onAmqpMessage(channel: import("amqplib").Channel, msg: import("amqplib").ConsumeMessage | null) {
		if (!msg) return
		channel.ack(msg)
		const parsed: import("discord-api-types/v10").GatewayDispatchPayload & { shard_id: number; cluster_id: string } = JSON.parse(msg.content.toString("utf-8"))
		// -1 s means it was an interaction sent from website and this path is for bots still using gateway interactions
		if (parsed.s !== -1 && parsed.t === "INTERACTION_CREATE" && (parsed.d.type === 2 || parsed.d.type === 3)) {
			await client.snow.interaction.createInteractionResponse(parsed.d.id, parsed.d.token, { type: parsed.d.type === 2 ? 5 : 6 })
			if (parsed.d.type === 2 && musicCommands.includes(parsed.d.data.name)) return channel.sendToQueue(config.amqp_music_queue, msg.content)
		}
		client.emit("gateway", parsed)
	},

	onAmqpChannelClose(...params: Array<unknown>) {
		console.error(...params)
	},

	loadCommands() {
		sync.require([
			"./stdin",
			"./EventManager",
			"./commands/hidden",
			"./commands/images",
			"./commands/interaction",
			"./commands/money",
			"./commands/music-stub",
			"./commands/meta" // meta should load last always for command docs reasons
		])
	},

	async onGlobalError(e: unknown) {
		console.error(e)
		client.snow.channel.createMessage("512869106089852949", {
			embeds: [
				{
					title: "Global error occured.",
					description: await require("./utils/string").stringify(e),
					color: 0xdd2d2d
				}
			]
		})
	}
}

sync.addTemporaryListener(sync.events, path.join(__dirname, "../../config.js"), async () => {
	setConfiguredUserID()
	const newToken = `Bot ${config.bot_token}`
	if (client.snow.token !== newToken) {
		await setup.setupClient()
		console.warn(`Client token changed. Now logged in as ${client.user.username}#${client.user.discriminator}`)
		client.snow.token = newToken
	}

	if (config.db_enabled && !passthrough.db) setup.setupPg()
	else if (!config.db_enabled && passthrough.pool) setup.disconnectPg()

	if (config.amqp_enabled && !passthrough.amqpChannel) setup.setupAmqp()
	else if (!config.amqp_enabled && passthrough.amqpChannel) setup.disconnectAmqp()
})

export = setup
