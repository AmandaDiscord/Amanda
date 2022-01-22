import passthrough from "../passthrough"
const { config, sync } = passthrough

const orm = sync.require("./orm") as typeof import("./orm")

export async function getOwnStats() {
	const ram = process.memoryUsage()
	return {
		uptime: process.uptime(),
		ram: ram.rss - (ram.heapTotal - ram.heapUsed),
		users: await orm.db.raw("SELECT COUNT(*) AS count FROM users WHERE added_by = $1", [config.cluster_id]).then(d => Number(d[0]?.count || 0)),
		guilds: await orm.db.raw("SELECT COUNT(*) AS count FROM guilds WHERE added_by = $1", [config.cluster_id]).then(d => Number(d[0]?.count || 0)),
		channels: await orm.db.raw("SELECT COUNT(*) AS count FROM channels").then(d => Number(d[0]?.count || 0)),
		connections: 0
	}
}

export default exports as typeof import("./cluster")
