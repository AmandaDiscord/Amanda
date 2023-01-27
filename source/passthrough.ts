interface Passthrough {
	client: import("./client/modules/Amanda")
	commands: import("./client/modules/CommandManager")<[import("./client/modules/Command"), import("@amanda/lang").Lang, { shard_id: number; cluster_id: string }]>
	config: import("./types").Config
	constants: typeof import("./constants")
	db: import("pg").PoolClient
	frisky: import("frisky-client")
	sync: import("heatsync")
	listenMoe: { jp: import("listensomemoe"); kp: import("listensomemoe") }

	queues: Map<string, import("./website/music/queue").Queue>
	lavalink: import("lavacord").Manager
	rootFolder: string
	configuredUserID: string
	liveUserID: string
	wss: import("ws").Server<import("ws").WebSocket>
	amqpChannel: import("amqplib").Channel
	joiningGuildShardMap: Map<string, number>
	snow: import("snowtransfer").SnowTransfer
}

const pt = { clusterData: { connected_shards: [] as Array<number>, guild_ids: {} }, queues: new Map() } as unknown as Passthrough

export = pt
