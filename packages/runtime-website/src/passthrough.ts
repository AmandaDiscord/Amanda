import path = require("path")

type Passthrough = {
	server: import("uWebSockets.js").TemplatedApp
	sync: import("heatsync")
	rootFolder: string
	confprovider: typeof import("@amanda/config")
	commands: import("@amanda/commands").CommandManager<import("@amanda/shared-types").CommandManagerParams>
	queues: Map<string, import("./music/queue").Queue>,
	snow: import("snowtransfer").SnowTransfer
	lavalink: import("lavacord").Manager
	sessions: Map<string, import("./ws/public").Session>
	sessionGuildIndex: Map<string, Set<string>>
	commandWorkers: Array<import("./ws/internal").CommandWorker>
	gatewayWorkers: Map<string, import("./ws/gateway").GatewayWorker>
	gatewayShardIndex: Map<number, string>
}

export = {
	rootFolder: path.join(__dirname, "../webroot"),
	queues: new Map(),
	// Ignored otherwise TypeScript complains that this export isn't assignable to type Passthrough for whatever reason
	// your guess is as good as mine
	sessions: new Map(),
	sessionGuildIndex: new Map(),
	commandWorkers: new Array(),
	gatewayWorkers: new Map(),
	gatewayShardIndex: new Map()
} as Passthrough
