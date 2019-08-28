//@ts-check

const passthrough = require("./passthrough")

const mysql = require("mysql2/promise");
const hotreload = require("./modules/hotreload.js");
const YouTube = require("simple-youtube-api");
const nedb = require("nedb-promises")

const Amanda = require("./modules/structures/Discord/Amanda");

// @ts-ignore
const config = require("./config.js");
const client = new Amanda({disableEveryone: true, disabledEvents: ["TYPING_START"]});
const youtube = new YouTube(config.yt_api_key);

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
	]);

	let reloader = new hotreload();
	Object.assign(passthrough, {config, client, db, reloader, youtube})
	passthrough.reloadEvent = reloader.reloadEvent

	reloader.setupWatch([
		"./modules/utilities.js",
		"./modules/validator.js",
		"./commands/music/common.js",
		"./commands/music/songtypes.js",
		"./commands/music/queue.js",
		"./commands/music/playlistcommand.js",
		"./modules/lang.js",
	]);

	const CommandStore = require("./modules/managers/CommandStore")
	const GameManager = require("./modules/managers/GameManager")
	const QueueStore = require("./commands/music/queue.js").QueueStore

	passthrough.reactionMenus = new Map()
	passthrough.commands = new CommandStore()
	passthrough.gameManager = new GameManager()
	passthrough.queueStore = new QueueStore()
	passthrough.nedb = {
		queue: nedb.create({filename: "saves/queue.db", autoload: true})
	}

	reloader.watchAndLoad([
		"./modules/events.js",
		"./modules/stdin.js",
		"./commands/admin.js",
		"./commands/cleverai.js",
		"./commands/gambling.js",
		"./commands/games.js",
		"./commands/images.js",
		"./commands/interaction.js",
		"./commands/meta.js",
		"./commands/music/music.js",
		"./commands/music/playlistcommand.js",
		"./commands/traa.js",
		"./commands/web/server.js",
		//"./commands/alerts.js"
	]);

	// no reloading for statuses. statuses will be periodically fetched from mysql.
	require("./modules/status.js")

	client.login(config.bot_token);

})();
