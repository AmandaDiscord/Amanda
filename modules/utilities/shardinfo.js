// @ts-check

const passthrough = require("../../passthrough")
const { client } = passthrough

async function getOwnStats() {
	const ram = process.memoryUsage()
	return {
		uptime: process.uptime(),
		ram: ram.rss - (ram.heapTotal - ram.heapUsed),
		users: 0,
		guilds: 0,
		channels: 0,
		connections: client.lavalink.players.size
	}
}

module.exports.getOwnStats = getOwnStats
