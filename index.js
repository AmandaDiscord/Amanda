// @ts-check

const mysql = require("mysql2/promise")
const YouTube = require("simple-youtube-api")
const nedb = require("nedb-promises")
const Frisky = require("frisky-client")

const passthrough = require("./passthrough")
const Amanda = require("./modules/structures/Discord/Amanda")
const config = require("./config.js")
const constants = require("./constants.js")
const Reloader = require("./modules/hotreload")

const client = new Amanda({ disableEveryone: true, disabledEvents: ["TYPING_START", "PRESENCE_UPDATE"], messageCacheMaxSize: 0 })
const youtube = new YouTube(config.yt_api_key)
const reloader = new Reloader()

const db = mysql.createPool({
	host: config.mysql_domain,
	user: "amanda",
	password: config.mysql_password,
	database: "money",
	connectionLimit: 5
});

(async () => {

	await Promise.all([
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	])

	Object.assign(passthrough, { config, constants, client, db, reloader, youtube, reloadEvent: reloader.reloadEvent, frisky: new Frisky() })

	reloader.setupWatch([
		"./modules/utilities.js"
	])

	const IPC = require("./modules/ipc/ipcbot.js")
	const ipc = new IPC()
	passthrough.ipc = ipc

	reloader.setupWatch([
		"./commands/music/common.js",
		"./commands/music/playlistcommand.js",
		"./commands/music/queue.js",
		"./commands/music/songtypes.js"
	])

	const { CommandStore, GameStore, PeriodicHistory, QueueStore, reactionMenus } = require("./modules/managers")

	passthrough.reactionMenus = reactionMenus
	passthrough.commands = new CommandStore()
	passthrough.gameStore = new GameStore()
	passthrough.queueStore = new QueueStore()
	passthrough.periodicHistory = new PeriodicHistory([
		{ field: "song_start", ttl: 86400e3 },
		{ field: "game_start", ttl: 86400e3 }
	])
	passthrough.nedb = {
		queue: nedb.create({ filename: `saves/queue-${client.options.shards}.db`, autoload: true })
	}

	reloader.watchAndLoad([
		"./commands/music/music.js",
		"./commands/music/playlistcommand.js",
		"./commands/admin.js",
		"./commands/alerts.js",
		"./commands/cleverai.js",
		"./commands/gambling.js",
		"./commands/games.js",
		"./commands/images.js",
		"./commands/interaction.js",
		"./commands/meta.js",
		"./commands/todo.js",
		"./commands/traa.js",
		"./modules/events.js",
		"./modules/stdin.js"
	])

	// no reloading for statuses. statuses will be periodically fetched from mysql.
	require("./commands/status.js")

	client.login(config.bot_token)

})()
