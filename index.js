// @ts-check
const fs = require("fs")
const path = require("path")
const events = require("events")
const workers = require("worker_threads")

const Postgres = require("pg")
const YouTube = require("simple-youtube-api")
const nedb = require("nedb-promises")
const Frisky = require("frisky-client")
/** @type {typeof import("./typings/Taihou")} */
const WeebSH = require("taihou")
const Sync = require("heatsync")
const SnowTransfer = require("snowtransfer")
const ThunderStorm = require("thunderstorm")

const CommandManager = require("@amanda/commandmanager")
const ListenMoe = require("listensomemoe")

const passthrough = require("./passthrough")
const Amanda = require("./modules/structures/Discord/Amanda")
const config = require("./config.js")
const constants = require("./constants.js")

const rest = new SnowTransfer(config.bot_token, { disableEveryone: true })
const client = new Amanda({ snowtransfer: rest, disableEveryone: true })
const youtube = new YouTube(config.yt_api_key)
const sync = new Sync()
sync.events.on("any", (file) => console.log(`${file} was changed`))
const listenMoeJP = new ListenMoe(ListenMoe.Constants.baseJPOPGatewayURL)
const listenMoeKP = new ListenMoe(ListenMoe.Constants.baseKPOPGatewayURL)
const weeb = new WeebSH(config.weeb_api_key, true, { userAgent: config.weeb_identifier, timeout: 20000, baseURL: "https://api.weeb.sh" })
/** @type {import("./typings").internalEvents} */
const internalEvents = new events.EventEmitter()

const pool = new Postgres.Pool({
	host: config.sql_domain,
	user: "amanda",
	password: config.sql_password,
	database: "main",
	max: 2
})

;(async () => {
	// DB

	const db = await pool.connect()
	console.log("Connected to database")

	await db.query({ text: "DELETE FROM voice_states WHERE guild_id IN (SELECT id FROM guilds WHERE added_by = $1)", values: [config.cluster_id] })
	console.log("Deleted all voice states")

	Object.assign(passthrough, { config, constants, client, db, sync, youtube, internalEvents, frisky: new Frisky(), weeb, listenMoe: { jp: listenMoeJP, kp: listenMoeKP } })

	// Gateway
	const GatewayWorker = new workers.Worker(path.join(__dirname, "./workers/gateway.js"))
	const GatewayRequester = require("./modules/managers/GatewayRequester")
	const gateway = new GatewayRequester(GatewayWorker)
	passthrough.workers = { gateway }

	GatewayWorker.on("message", (message) => {
		const { op, data, threadID } = message
		const utils = require("./modules/utilities")

		if (op === "DISCORD") {
			utils.cacheManager.process(data)
			return ThunderStorm.handle(message.data, client)
		} else {
			if (op === "ERROR_RESPONSE") return console.error(data)
			if (gateway.outgoing.has(threadID)) {
				gateway.outgoing.use(threadID)(data)
			} else console.log(`Not a thread:\n${message}`)
		}
	})

	client._snow.requestHandler.on("requestError", console.error)

	listenMoeJP.on("error", console.error)
	listenMoeKP.on("error", console.error)
	listenMoeJP.on("unknown", console.log)
	listenMoeKP.on("unknown", console.log)

	// IPC

	const IPC = require("./modules/ipc/ipcbot.js")
	const ipc = new IPC()
	passthrough.ipc = ipc

	sync.require([
		"./modules/ipc/ipcbotreplier.js"
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

	// Commands

	sync.require([
		"./commands/music/music.js",
		"./commands/music/playlistcommand.js",
		"./commands/admin.js",
		"./commands/couples.js",
		"./commands/gambling.js",
		"./commands/games.js",
		"./commands/hidden.js",
		"./commands/images.js",
		"./commands/interaction.js",
		"./commands/meta.js",
		"./commands/webhookalias.js",
		"./modules/events.js",
		"./modules/stdin.js"
	])

	// no reloading for statuses. statuses will be periodically fetched from mysql.
	require("./commands/status.js")
})()
