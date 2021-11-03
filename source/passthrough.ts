interface Passthrough {
	db: import("pg").PoolClient
	sync: import("heatsync")
}

export = {} as Passthrough
