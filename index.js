//@ts-check

const passthrough = require("./passthrough")

const mysql = require("mysql2/promise")
const hotreload = require("./modules/hotreload.js")
const YouTube = require("simple-youtube-api")
const nedb = require("nedb-promises")

const Amanda = require("./modules/structures/Discord/Amanda");

// @ts-ignore
const config = require("./config.js")
const client = new Amanda({disableEveryone: true, disabledEvents: ["TYPING_START"]})
const youtube = new YouTube(config.yt_api_key)

let db = mysql.createPool({
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

	let reloader = new hotreload()
	Object.assign(passthrough, {config, client, db, reloader, youtube})
	passthrough.reloadEvent = reloader.reloadEvent

	reloader.setupWatch([
		"./commands/music/common.js",
		"./commands/music/playlistcommand.js",
		"./commands/music/queue.js",
		"./commands/music/songtypes.js",
		"./modules/lang.js",
		"./modules/utilities.js",
		"./modules/validator.js",
	])

	const Frisky = require("frisky-client")
	passthrough.frisky = new Frisky()

	const CommandStore = require("./modules/managers/CommandStore")
	const GameStore = require("./modules/managers/GameStore")
	const QueueStore = require("./modules/managers/QueueStore")
	const PeriodicHistory = require("./modules/managers/PeriodicHistory")

	passthrough.reactionMenus = new Map()
	passthrough.commands = new CommandStore()
	passthrough.gameStore = new GameStore()
	passthrough.queueStore = new QueueStore()
	passthrough.periodicHistory = new PeriodicHistory([
		{field: "song_start", ttl: 86400e3},
		{field: "game_start", ttl: 86400e3}
	])
	passthrough.nedb = {
		queue: nedb.create({filename: "saves/queue.db", autoload: true})
	}

	reloader.watchAndLoad([
		"./commands/music/music.js",
		"./commands/music/playlistcommand.js",
		"./commands/web/server.js",
		"./commands/admin.js",
		"./commands/alerts.js",
		"./commands/cleverai.js",
		"./commands/gambling.js",
		"./commands/games.js",
		"./commands/images.js",
		"./commands/interaction.js",
		"./commands/meta.js",
		"./commands/traa.js",
		"./modules/events.js",
		"./modules/stdin.js",
	])

	// no reloading for statuses. statuses will be periodically fetched from mysql.
	require("./modules/status.js")

	client.login(config.bot_token)

})()
