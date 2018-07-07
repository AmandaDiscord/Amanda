process.title = "Amanda";
const Auth = process.env.is_heroku ? JSON.parse(process.env.auth) : require("./auth.json", "utf8");
const Config = require("./auth.json", "utf8");
const events = require("events");
let reloadEvent = new events.EventEmitter();
let utils = {};
const commands = {};

const Discord = require('discord.js');
const client = new Discord.Client();
client.login(Auth.bot_token);

console.log(`Starting`);

if (process.env.is_heroku) require("http").createServer((req, res) => {
	res.writeHead(200, {"Content-Type": "text/plain"});
	res.end("Nice");
}).listen(process.env.PORT);

let db = require("./database.js")(Auth.mysql_password);
let passthrough = { Auth, Discord, client, reloadEvent, utils, db, commands, Config };
require("./plugins.js")(passthrough);