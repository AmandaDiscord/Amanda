/* eslint-disable @typescript-eslint/no-array-constructor */

import path = require("path")

import type { APIUser } from "discord-api-types/v10"

type Passthrough = {
	server: import("uWebSockets.js").TemplatedApp
	sync: import("heatsync")
	rootFolder: string
	confprovider: import("@amanda/config")
	sql: import("@amanda/sql")
	commands: import("@amanda/commands").CommandManager<import("@amanda/shared-types").CommandManagerParams>
	queues: Map<string, import("./music/queue").Queue>
	snow: import("snowtransfer").SnowTransfer
	lavalink: import("lavacord").Manager
	sessions: Array<import("./ws/public").Session>
	commandWorkers: Array<import("./ws/internal").CommandWorker>
	gatewayWorkers: { [cluster_id: string]: import("./ws/gateway").GatewayWorker }
	voiceStates: Map<string, { user_id: string; channel_id: string; guild_id: string; user?: APIUser }>
	guildStatesIndex: Map<string, Set<string>>
	guildCount: number
	clientUser: APIUser | undefined
}

export = {
	rootFolder: path.join(__dirname, "../webroot"),
	queues: new Map(),
	// Ignored otherwise TypeScript complains that this export isn't assignable to type Passthrough for whatever reason
	// your guess is as good as mine
	sessions: new Array(),
	commandWorkers: new Array(),
	gatewayWorkers: {},
	voiceStates: new Map(),
	guildStatesIndex: new Map(),
	guildCount: 0
} as Passthrough
