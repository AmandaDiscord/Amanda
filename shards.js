// @ts-check

const Discord = require("discord.js")
const pj = require("path").join

const config = require("./config.js")

const shardingManager = new Discord.ShardingManager(
	pj(__dirname, "index.js"),
	{
		totalShards: 2,
		shardList: config.shard_list,
		mode: "process",
		respawn: true,
		token: config.bot_token,
		execArgv: ["--expose-gc", "--optimize_for_size"]
	}
)

shardingManager.spawn()
