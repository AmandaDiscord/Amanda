process.title = "Amanda";
const fs = require("fs");
const Auth = process.env.is_heroku ? JSON.parse(process.env.auth) : require("./auth.json", "utf8");
const events = require("events");
let reloadEvent = new events.EventEmitter();
let utils = {};
const commands = {};

const Discord = require('discord.js');
const discordClient = require("dualcord");
const client = new discordClient();
client.login({token: Auth.bot_token});
const dio = client.dioClient();
const djs = client.djsClient();

console.log(`Starting`);

if (process.env.is_heroku) require("http").createServer((req, res) => {
	res.writeHead(200, {"Content-Type": "text/plain"});
	res.end("Nice");
}).listen(process.env.PORT);

let db = require("./database.js")(Auth.mysql_password);
let passthrough = { Auth, Discord, client, djs, dio, reloadEvent, utils, db, commands };
require("./plugins.js")(passthrough);