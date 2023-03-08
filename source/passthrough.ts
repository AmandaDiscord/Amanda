interface Passthrough {
	// Global props
	commands: import("./CommandManager")<[import("./Command"), import("@amanda/lang").Lang, { shard_id: number; cluster_id: string }]>
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	config: typeof import("../config.sample")
	constants: typeof import("./constants")
	pool: import("pg").Pool
	db: import("pg").PoolClient
	sync: import("heatsync")
	amqpChannel: import("amqplib").Channel
	configuredUserID: string
	repl: import("repl").REPLServer

	// Client code base props
	client: import("./client/Amanda")

	// Website props
	rootFolder: string
	liveUserID: string
	wss: import("ws").Server<import("ws").WebSocket>
	webQueues: Map<string, import("./types").WebQueue>
	sessions: Array<typeof import("./website/music")["Session"]["prototype"]>

	// Music worker props
	queues: Map<string, import("./music/queue").Queue>
	lavalink: import("lavacord").Manager

	// extras shared by only a couple
	snow: import("snowtransfer").SnowTransfer
}

const pt = {} as unknown as Passthrough

export = pt
