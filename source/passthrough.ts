interface Passthrough {
	client: import("./modules/Amanda")
	clusterData: { connected_shards: Array<number>; guild_ids: { [sid: number]: Array<string> } }
	commands: import("@amanda/commandmanager")<[import("thunderstorm").CommandInteraction, import("@amanda/lang").Lang]>
	config: import("./types").Config
	constants: typeof import("./constants")
	db: import("pg").PoolClient
	frisky: import("frisky-client")
	gateway: import("worker_threads").Worker
	internalEvents: import("./types").internalEvents
	requester: import("./utils/classes/ThreadBasedReplier")<Record<string, number>>
	sync: import("heatsync")
	weebsh: import("taihou")
}

export = { clusterData: { connected_shards: [] as Array<number>, guild_ids: {} } } as Passthrough
