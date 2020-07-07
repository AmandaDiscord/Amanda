// @ts-check

const passthrough = require("../../passthrough")
const { config, client } = passthrough

function getFirstShard() {
	if (client.shard) return client.shard.ids[0]
	else return 0
}

function getShardsArray() {
	if (client.shard) return client.shard.ids
	else return [0]
}

function getFirstShardForMachine() {
	if (config.shard_list) return config.shard_list[0]
	else return 0
}

function isFirstShardOnMachine() {
	return getFirstShard() === getFirstShardForMachine()
}

function getOwnStats() {
	const ram = process.memoryUsage()
	return {
		ping: client.ws.ping,
		uptime: process.uptime(),
		ram: ram.rss - (ram.heapTotal - ram.heapUsed),
		users: client.users.cache.size,
		guilds: client.guilds.cache.size,
		channels: client.channels.cache.size,
		connections: client.lavalink.players.size
	}
}

module.exports.getFirstShard = getFirstShard
module.exports.getShardsArray = getShardsArray
module.exports.getFirstShardForMachine = getFirstShardForMachine
module.exports.isFirstShardOnMachine = isFirstShardOnMachine
module.exports.getOwnStats = getOwnStats
