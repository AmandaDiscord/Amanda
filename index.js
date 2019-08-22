const mysql = require("mysql2/promise");
const hotreload = require("./modules/hotreload.js");
const managers = require("./modules/managers");
const YouTube = require("simple-youtube-api");

const { Amanda } = require("./modules/structures");

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

let commands = new managers.CommandStore();

(async () => {
	await Promise.all([
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	]);

	let reloader = new hotreload();
	let passthrough = {config, client, commands, db, reloader, reloadEvent: reloader.reloadEvent, queueManager: managers.QueueManager, gameManager: managers.GameManager, youtube, wss: undefined};
	reloader.setPassthrough(passthrough);
	reloader.setupWatch([
		"./modules/utilities.js",
		"./modules/validator.js",
		"./commands/music/common.js",
		"./commands/music/songtypes.js",
		"./commands/music/queue.js",
		"./commands/music/playlistcommand.js"
	]);
	reloader.watchAndLoad([
		"./modules/prototypes.js",
		"./modules/events.js",
		"./modules/stdin.js",
		"./modules/lang.js",
		"./commands/admin.js",
		"./commands/cleverai.js",
		"./commands/gambling.js",
		"./commands/games.js",
		"./commands/images.js",
		"./commands/interaction.js",
		"./commands/meta.js",
		"./commands/music/music.js",
		"./commands/traa.js",
		"./commands/web/server.js",
	]);
	
	// no reloading for statuses. statuses will be periodically fetched from mysql.
	require("./modules/status.js")(passthrough)

	client.login(config.bot_token);

})();
