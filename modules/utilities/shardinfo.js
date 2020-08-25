// @ts-check

const passthrough = require("../../passthrough")
const sql = require("./sql")
const { config, client } = passthrough

async function getOwnStats() {
	const ram = process.memoryUsage()
	return {
		uptime: process.uptime(),
		ram: ram.rss - (ram.heapTotal - ram.heapUsed),
		users: await sql.get("SELECT COUNT(*) AS count FROM Users", undefined, passthrough.cache).then(d => d["count"]),
		guilds: await sql.get("SELECT COUNT(*) AS count FROM Guilds", undefined, passthrough.cache).then(d => d["count"]),
		channels: await sql.get("SELECT COUNT(*) AS count FROM Channels", undefined, passthrough.cache).then(d => d["count"]),
		connections: client.lavalink.players.size
	}
}

module.exports.getOwnStats = getOwnStats
