interface Passthrough {
	client: import("./modules/Amanda")
	config: import("./types").Config
	constants: typeof import("./constants")
	db: import("pg").PoolClient
	sync: import("heatsync")
	weebsh: import("taihou")
	internalEvents: import("./types").internalEvents
	gateway: import("worker_threads").Worker
	requester: import("./utils/classes/ThreadBasedReplier")<Record<string, number>>
	frisky: import("frisky-client")
}

export = {} as Passthrough
