process.title = "Amanda";
const fs = require("fs");
process.env.auth = (process.env.is_heroku)? JSON.parse(process.env.auth):require('./auth.json'); 
const events = require("events");
let reloadEvent = new events.EventEmitter();
let utils = {};
const commands = {};

const Discord = require('discord.js');
const discordClient = require("dualcord");
const client = new discordClient();
client.login({ token: process.env.auth.bot_token });
const dio = client.dioClient();
const djs = client.djsClient();

console.log(`Starting`);

const PORT = process.env.PORT || 5000
const express = require('express')
const app = express()
app.get('/', function (req, res) {
  res.send('Online')
})
app.listen(PORT)

let db = require("./database.js")();
let passthrough = { Discord, client, djs, dio, reloadEvent, utils, db, commands };
require("./plugins.js")(passthrough);