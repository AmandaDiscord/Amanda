const Discord = require("discord.js");
const mysql = require("mysql2/promise");
const config = require("./config.json");
const hotreload = require("./hotreload.js");

const client = new Discord.Client({disableEveryone: true});

let db = mysql.createPool({
	host: "cadence.gq",
	user: "amanda",
	password: config.mysql_password,
	database: "money",
	connectionLimit: 5
});

const commands = {};
let reactionMenus = {};
let queueManager = {
	storage: new Discord.Collection(),
	addQueue(queue) {
		this.storage.set(queue.id, queue);
	}
};

(async () => {
	await Promise.all([
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	])

	let reloader = new hotreload();
	let passthrough = {config, client, commands, db, reloader, reloadEvent: reloader.reloadEvent, reactionMenus, queueManager}
	reloader.setPassthrough(passthrough);
	reloader.setupWatch([
		"./modules/utilities.js",
	])
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
		"./commands/music.js",
		"./commands/traa.js"
	])

	client.login(config.bot_token);

})();