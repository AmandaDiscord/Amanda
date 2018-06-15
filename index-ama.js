process.title = "Amanda";
const fs = require("fs");
const Config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const Auth = JSON.parse(fs.readFileSync("./auth.json", "utf8"));
const events = require("events");
const mysql = require("mysql2/promise");
let reloadEvent = new events.EventEmitter();
let utils = {};

const Discord = require('discord.js');
const discordClient = require("dualcord");
const client = new discordClient();
client.login({ token: Auth.bot_token });
const dio = client.dioClient();
const djs = client.djsClient();

console.log(`Starting`);

const commands = {};

function load() {
	mysql.createConnection({
		host: 'cadence.gq',
		user: 'amanda',
		password: "password",
		database: 'money'
	}).then(db => {
		db.connect();
		let passthrough = { Config, Discord, client, djs, dio, reloadEvent, utils, db, commands };
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