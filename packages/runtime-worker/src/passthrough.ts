type Passthrough = {
	sync: import("heatsync")
	confprovider: import("@amanda/config")
	sql: import("@amanda/sql")
	commands: import("@amanda/commands").CommandManager<import("@amanda/shared-types").CommandManagerParams>
	client: import("./Amanda")
	webconnector: import("@amanda/web-internal")
}

export = {} as Passthrough
