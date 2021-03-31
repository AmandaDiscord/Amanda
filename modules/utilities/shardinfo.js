// @ts-check

const { get } = require("./sql")

const passthrough = require("../../passthrough")
const { client, config } = passthrough

async function getOwnStats() {
	const ram = process.memoryUsage()
	return {
		uptime: process.uptime(),
		ram: ram.rss - (ram.heapTotal - ram.heapUsed),
		users: await get("SELECT COUNT(*) AS count FROM users WHERE added_by = $1", config.cluster_id).then(d => d.count),
		guilds: await get("SELECT COUNT(*) AS count FROM guilds WHERE added_by = $1", config.cluster_id).then(d => d.count),
		channels: await get("SELECT COUNT(*) AS count FROM channels").then(d => d.count),
		connections: client.lavalink.players.size
	}
}

module.exports.getOwnStats = getOwnStats
