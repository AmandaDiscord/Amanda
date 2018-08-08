process.title = "Amanda";
const Auth = process.env.is_heroku ? JSON.parse(process.env.auth) : require("./auth.json", "utf8");
const Config = require("./config.json", "utf8");
const events = require("events");
const http = require("http");
const WebSocket = require("ws");
let reloadEvent = new events.EventEmitter();
let utils = {};
const commands = {};

const Discord = require('discord.js');
const client = new Discord.Client({ messageCacheMaxSize: 20, messageCacheLifetime: 7200, disableEveryone: true });
client.login(Auth.bot_token);

console.log(`Starting`);

const port = process.env.PORT || 8080;
let server = http.createServer((req, res) => {
	if (utils.server) utils.server(req, res);
	else {
		res.writeHead(200, {"Content-Type": "text/plain"});
		res.end("Dashboard not initialised. Assign a function to utils.server to use it.");
	}
});
server.listen(port);

const wss = new WebSocket.Server({server});
wss.on("connection", ws => {
	if (utils.ws) utils.ws(ws);
});

let db = require("./database.js")(Auth.mysql_password);
let passthrough = { Auth, Discord, client, reloadEvent, utils, db, commands, Config };
require("./plugins.js")(passthrough);