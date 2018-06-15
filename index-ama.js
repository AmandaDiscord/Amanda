process.title = "Amanda";
const fs = require("fs");
const Auth = JSON.parse(fs.readFileSync("./auth.json", "utf8"));
const events = require("events");
const mysql = require("mysql2/promise");
let reloadEvent = new events.EventEmitter();
let utils = {};
const commands = {};

const Discord = require('discord.js');
const discordClient = require("dualcord");
const client = new discordClient();
client.login({ token: Auth.bot_token });
const dio = client.dioClient();
const djs = client.djsClient();

console.log(`Starting`);

mysql.createConnection({
	host: 'cadence.gq',
	user: 'amanda',
	password: "password",
	database: 'money'
}).then(db => {
	db.connect();
	let passthrough = { Discord, client, djs, dio, reloadEvent, utils, db, commands };
	require("./plugins.js")(passthrough, loaded => {
		Object.assign(commands, loaded);
	});
});