import Discord from "thunderstorm"

interface Passthrough {
	queues: import("thunderstorm").Collection<string, import("./commands/music/queue")>
	client: import("./modules/Amanda")
	clusterData: { connected_shards: Array<number>; guild_ids: { [sid: number]: Array<string> } }
	commands: import("@amanda/commandmanager")<[import("thunderstorm").CommandInteraction, import("@amanda/lang").Lang]>
	config: import("./types").Config
	constants: typeof import("./constants")
	db: import("pg").PoolClient
	frisky: import("frisky-client")
	gateway: import("worker_threads").Worker
	requester: import("./utils/classes/ThreadBasedReplier")<Record<string, number>>
	sync: import("heatsync")
	weebsh: import("taihou")
	listenMoe: { jp: import("listensomemoe"); kp: import("listensomemoe") }
}

export = { clusterData: { connected_shards: [] as Array<number>, guild_ids: {} }, queues: new Discord.Collection() } as Passthrough