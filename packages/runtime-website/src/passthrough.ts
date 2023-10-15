import path = require("path")

type Passthrough = {
	server: import("uWebSockets.js").TemplatedApp
	sync: import("heatsync")
	rootFolder: string
	confprovider: typeof import("@amanda/config")
	sql: typeof import("@amanda/sql")
	commands: import("@amanda/commands").CommandManager<import("@amanda/shared-types").CommandManagerParams>
	queues: Map<string, import("./music/queue").Queue>,
	snow: import("snowtransfer").SnowTransfer
	lavalink: import("lavacord").Manager
	sessions: Array<import("./ws/public").Session>
	commandWorkers: Array<import("./ws/internal").CommandWorker>
	gatewayWorkers: { [cluster_id: string]: import("./ws/gateway").GatewayWorker }
}

export = {
	rootFolder: path.join(__dirname, "../webroot"),
	queues: new Map(),
	// Ignored otherwise TypeScript complains that this export isn't assignable to type Passthrough for whatever reason
	// your guess is as good as mine
	sessions: new Array(),
	commandWorkers: new Array(),
	gatewayWorkers: {}
} as Passthrough
