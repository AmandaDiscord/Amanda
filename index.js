// @ts-check

const mysql = require("mysql2/promise")
const YouTube = require("simple-youtube-api")
const nedb = require("nedb-promises")
const Frisky = require("frisky-client")
/** @type {typeof import("./typings/Taihou")} */
const WeebSH = require("taihou")
const Reloader = require("@amanda/reloader")
const fs = require("fs")
const events = require("events")
const SnowTransfer = require("snowtransfer")
const ThunderStorm = require("thunderstorm")

const CommandManager = require("@amanda/commandmanager")

const passthrough = require("./passthrough")
const Amanda = require("./modules/structures/Discord/Amanda")
const config = require("./config.js")
const constants = require("./constants.js")

const rest = new SnowTransfer(config.bot_token, { disableEveryone: true })
const client = new Amanda({ snowtransfer: rest, disableEveryone: true })
const youtube = new YouTube(config.yt_api_key)
const reloader = new Reloader(true, __dirname)
const weeb = new WeebSH(config.weeb_api_key, true, { userAgent: config.weeb_identifier, timeout: 20000, baseURL: "https://api.weeb.sh" })
/** @type {import("./typings").internalEvents} */
const internalEvents = new events.EventEmitter()

reloader.reloadEvent.setMaxListeners(20)

const db = mysql.createPool({
	host: config.mysql_domain,
	user: "amanda",
	password: config.mysql_password,
	database: "money",
	connectionLimit: 5
});

(async () => {
	// DB

	await client.rain.initialize()
	console.log("Client connected to data stream")
	client.connector.channel.assertQueue(config.amqp_data_queue, { durable: false, autoDelete: true })

	await Promise.all([
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	])

	Object.assign(passthrough, { config, constants, client, db, reloader, youtube, reloadEvent: reloader.reloadEvent, internalEvents, frisky: new Frisky(), weeb })

	const CacheRequester = require("./modules/managers/CacheRequester")
	const GatewayRequester = require("./modules/managers/GatewayRequester")
	const cache = new CacheRequester()
	const gateway = new GatewayRequester()
	passthrough.workers = { cache, gateway }

	client.connector.channel.consume(config.amqp_data_queue, data => {
		client.connector.channel.ack(data)

		const d = JSON.parse(data.content.toString())
		ThunderStorm.handle(d, client)
	})

	// Utility files

	reloader.watch([
		...fs.readdirSync("./modules/utilities").filter(f => f.endsWith(".js")).map(f => `./modules/utilities/${f}`),
		...fs.readdirSync("./modules/utilities/classes").filter(f => f.endsWith(".js")).map(f => `./modules/utilities/classes/${f}`)
	])

	// IPC

	const IPC = require("./modules/ipc/ipcbot.js")
	const ipc = new IPC()
	passthrough.ipc = ipc

	reloader.watchAndLoad([
		"./modules/ipc/ipcbotreplier.js"
	])
	reloader.watch([
		"./modules/ipc/ipcreplier.js"
	])

	// Music parts

	reloader.watch([
		"./commands/music/common.js",
		"./commands/music/playlistcommand.js",
		"./commands/music/queue.js",
		"./commands/music/songtypes.js"
	])

	// Passthrough managers

	const GameManager = require("./modules/managers/GameManager")
	const QueueManager = require("./modules/managers/QueueManager")
	const StreakManager = require("./modules/managers/StreakManager")
	const PeriodicHistory = require("./modules/structures/PeriodicHistory")

	passthrough.commands = new CommandManager()
	passthrough.games = new GameManager()
	passthrough.queues = new QueueManager()
	passthrough.streaks = new StreakManager()
	passthrough.periodicHistory = new PeriodicHistory([
		{ field: "song_start", ttl: 86400e3 },
		{ field: "game_start", ttl: 86400e3 }
	])
	passthrough.nedb = {
		queue: nedb.create({ filename: `saves/queue-${config.cluster_id}.db`, autoload: true })
	}
	internalEvents.emit("QueueManager", passthrough.queues)

	// Can't be part of reloader, and depends on IPC, so it's down here.

	reloader.watchAndLoad([
		"./modules/reloadapi.js"
	])

	// Commands

	reloader.watchAndLoad([
		"./commands/music/music.js",
		"./commands/music/playlistcommand.js",
		"./commands/admin.js",
		"./commands/gambling.js",
		"./commands/games.js",
		"./commands/images.js",
		"./commands/interaction.js",
		"./commands/meta.js",
		"./commands/todo.js",
		"./commands/webhookalias.js",
		"./modules/events.js",
		"./modules/stdin.js"
	])

	// no reloading for statuses. statuses will be periodically fetched from mysql.
	require("./commands/status.js")

	const ready = await gateway.login()
	ThunderStorm.handle(ready, client)
})()
