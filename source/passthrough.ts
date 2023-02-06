interface Passthrough {
	// Global props
	commands: import("./CommandManager")<[import("./Command"), import("@amanda/lang").Lang, { shard_id: number; cluster_id: string }]>
	config: import("./types").Config
	constants: typeof import("./constants")
	db: import("pg").PoolClient
	sync: import("heatsync")
	amqpChannel: import("amqplib").Channel
	configuredUserID: string

	// Client code base props
	client: import("./client/Amanda")

	// Website props
	rootFolder: string
	liveUserID: string
	wss: import("ws").Server<import("ws").WebSocket>
	webQueues: Map<string, import("./types").WebQueue>

	// Music worker props
	queues: Map<string, import("./music/queue").Queue>
	frisky: import("frisky-client")
	listenMoe: { jp: import("listensomemoe"); kp: import("listensomemoe") }
	lavalink: import("lavacord").Manager
	snow: import("snowtransfer").SnowTransfer
}

const pt = {} as unknown as Passthrough

export = pt
