const Discord = require("discord.js");
const client = new Discord.Client();
const config = process.env.is_heroku ? JSON.parse(process.env.config) : require("./config.json", "utf8");
const utils = {};
require("./loader.js")({ Discord, client, config, utils}).then(() => client.login(config.bot_token)).catch(error => console.error(error));