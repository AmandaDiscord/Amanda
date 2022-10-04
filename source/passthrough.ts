interface Passthrough {
	queues: Map<string, import("./commands/music/queue")>
	client: import("./modules/Amanda")
	clusterData: { connected_shards: Array<number>; guild_ids: { [sid: number]: Array<string> } }
	commands: import("./modules/CommandManager")<[import("./modules/Command"), import("@amanda/lang").Lang]>
	config: import("./types").Config
	constants: typeof import("./constants")
	db: import("pg").PoolClient
	frisky: import("frisky-client")
	gateway: import("worker_threads").Worker
	requester: import("./utils/classes/ThreadBasedReplier")<Record<string, number>>
	sync: import("heatsync")
	listenMoe: { jp: import("listensomemoe"); kp: import("listensomemoe") }
	websiteSocket: import("./modules/ReconnectingWS")

	rootFolder: string
	configuredUserID: string
	liveUserID: string
	webQueues: Map<string, import("./types").WebQueue>
	wss: import("ws").Server<import("ws").WebSocket>
}

const pt = { clusterData: { connected_shards: [] as Array<number>, guild_ids: {} }, queues: new Map() } as unknown as Passthrough

export = pt
