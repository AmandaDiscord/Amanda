import passthrough = require("../../passthrough")
const { config, sync } = passthrough

const orm: typeof import("./orm") = sync.require("./orm")

export async function getOwnStats() {
	const ram = process.memoryUsage()
	return {
		uptime: process.uptime(),
		ram: ram.rss - (ram.heapTotal - ram.heapUsed),
		users: config.db_enabled ? await orm.db.raw("SELECT COUNT(*) AS count FROM users WHERE added_by = $1", [passthrough.configuredUserID]).then(d => Number(d[0]?.count || 0)) : 0,
		guilds: config.db_enabled ? await orm.db.raw("SELECT COUNT(*) AS count FROM guilds WHERE client_id = $1", [passthrough.configuredUserID]).then(d => Number(d[0]?.count || 0)) : 0,
		connections: config.db_enabled ? await orm.db.raw("SELECT COUNT(*) AS count FROM voice_states WHERE user_id = $1", [passthrough.configuredUserID]).then(d => Number(d[0]?.count || 0)) : 0
	}
}
