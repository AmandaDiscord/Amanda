process.title = "Amanda";
const fs = require("fs");
const Config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const Auth = JSON.parse(fs.readFileSync("./auth.json", "utf8"));
const sql = require("sqlite");
const events = require("events");
let reloadEvent = new events.EventEmitter();
let utils = {};

const Discord = require('discord.js');
const discordClient = require("dualcord");
const client = new discordClient();
client.login({ token: Auth.bot_token });
const dio = client.dioClient();
const djs = client.djsClient();

console.log(`Starting`);

process.on("unhandledRejection", (reason) => {
	console.error(reason);
});

const commands = {};

function load() {
	Promise.all([
		sql.open("./databases/money.sqlite"),
		sql.open("./databases/music.sqlite")
	]).then(dbs => {
		let passthrough = { Config, Discord, client, djs, dio, reloadEvent, utils, dbs, commands };
		require("./plugins.js")(passthrough, loaded => {
			Object.assign(commands, loaded);
		});
	});
};

let stdin = process.stdin;
stdin.on("data", async function(input) {
	input = input.toString();
	try {
		await eval(input);
	} catch (e) {
			console.log(e.stack);
	}
});

load();