// @ts-check

const Discord = require("discord.js")
const pj = require("path").join

const config = require("./config.js")

const shardingManager = new Discord.ShardingManager(
	pj(__dirname, "index.js"),
	{
		totalShards: 2,
		mode: "process",
		respawn: true,
		token: config.bot_token
	}
)

shardingManager.spawn()
