import path = require("path")

type Passthrough = {
	server: import("uWebSockets.js").TemplatedApp
	sync: import("heatsync")
	rootFolder: string
	confprovider: import("@amanda/config")
	sql: import("@amanda/sql")
	amqp: import("@amanda/amqp")
	commands: import("@amanda/commands").CommandManager<import("@amanda/shared-types").CommandManagerParams>
	queues: Map<string, import("./music/queue").Queue>,
	snow: import("snowtransfer").SnowTransfer
	lavalink: import("lavacord").Manager
	sessions: Array<import("./ws/public").Session>
}

export = {
	rootFolder: path.join(__dirname, "../webroot"),
	queues: new Map(),
	// Ignored otherwise TypeScript complains that this export isn't assignable to type Passthrough for whatever reason
	// your guess is as good as mine
	// eslint-disable-next-line @typescript-eslint/no-array-constructor
	sessions: new Array()
} as Passthrough
