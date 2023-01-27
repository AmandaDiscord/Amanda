import passthrough from "../../passthrough"
const { client, config, sync, queues } = passthrough

const orm = sync.require("./orm") as typeof import("./orm")

export async function getOwnStats() {
	const ram = process.memoryUsage()
	return {
		uptime: process.uptime(),
		ram: ram.rss - (ram.heapTotal - ram.heapUsed),
		users: config.db_enabled ? await orm.db.raw("SELECT COUNT(*) AS count FROM users WHERE added_by = $1", [config.cluster_id]).then(d => Number(d[0]?.count || 0)) : 0,
		guilds: config.db_enabled ? await orm.db.raw("SELECT COUNT(*) AS count FROM guilds WHERE client_id = $1", [client.user.id]).then(d => Number(d[0]?.count || 0)) : 0,
		connections: queues.size
	}
}

export default exports as typeof import("./cluster")
