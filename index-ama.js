process.title = "Amanda";
const fs = require("fs");
const Auth = JSON.parse(fs.readFileSync("./auth.json", "utf8"));
const events = require("events");
let reloadEvent = new events.EventEmitter();
let utils = {};
const commands = {};

const Discord = require('discord.js');
const discordClient = require("dualcord");
const client = new discordClient();
client.login({ token: Auth.bot_token });
const dio = client.dioClient();
const djs = client.djsClient();

process.on("unhandledRejection", reason => { if (reason.code == 10008) return; if (reason.code == 50013) return; console.error(reason); });
console.log(`Starting`);

require("./database.js")().then(db => {
	let passthrough = { Discord, client, djs, dio, reloadEvent, utils, db, commands };
	require("./plugins.js")(passthrough, loaded => { Object.assign(commands, loaded); });
});