const Discord = require("discord.js");
const client = new Discord.Client({ disableEveryone: true });
const config = process.env.is_heroku ? JSON.parse(process.env.config) : require("./config.json", "utf8");
const utils = require("./modules/util.js");
require("./modules/prototypes.js");
const commands = {};
let reloadEvent = new (require("events").EventEmitter)();
require("./loader.js")({ Discord, client, config, utils, commands, reloadEvent }).then(() => { client.login(config.bot_token); });