type Passthrough = {
	sync: import("heatsync")
	confprovider: typeof import("@amanda/config")
	sql: typeof import("@amanda/sql")
	commands: import("@amanda/commands").CommandManager<import("@amanda/shared-types").CommandManagerParams>
	client: import("./Amanda")
	webconnector: import("@amanda/web-internal")
}

export = {} as Passthrough
