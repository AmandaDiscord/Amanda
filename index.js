// @ts-check

const mysql = require("mysql2/promise")
const YouTube = require("simple-youtube-api")
const nedb = require("nedb-promises")
const Frisky = require("frisky-client")
const Discord = require("discord.js")
const WeebSH = require("taihou")
const CommandManager = require("@amanda/commandmanager")
const Reloader = require("@amanda/reloader")

const passthrough = require("./passthrough")
const Amanda = require("./modules/structures/Discord/Amanda")
const config = require("./config.js")
const constants = require("./constants.js")

// @ts-ignore
const intents = new Discord.Intents((config.additional_intents || []).concat(["DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS", "GUILDS", "GUILD_EMOJIS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_VOICE_STATES"]))
const client = new Amanda({ disableMentions: "everyone", messageCacheMaxSize: 0, ws: { intents: intents } })
const youtube = new YouTube(config.yt_api_key)
const reloader = new Reloader(true, __dirname)
// @ts-ignore
const weeb = new WeebSH(config.weeb_api_key, true, { userAgent: config.weeb_identifier, timeout: 20000, baseURL: "https://api.weeb.sh" })

const db = mysql.createPool({
	host: config.mysql_domain,
	user: "amanda",
	password: config.mysql_password,
	database: "money",
	connectionLimit: 5
});

(async () => {
	// DB

	await Promise.all([
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	])

	Object.assign(passthrough, { config, constants, client, db, reloader, youtube, reloadEvent: reloader.reloadEvent, frisky: new Frisky(), weeb })

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
		queue: nedb.create({ filename: `saves/queue-${client.options.shards}.db`, autoload: true })
	}
	// @ts-ignore
	client.emit("QueueManager", passthrough.queues)

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

	client.login(config.bot_token)

})()
