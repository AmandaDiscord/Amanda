import passthrough = require("../passthrough");
const { server, sync, commands } = passthrough

const utils: typeof import("../utils") = sync.require("../utils")

// non specified paths (fs)
server.get("/*", (res, req) => utils.streamFile(req.getUrl(), res, req.getHeader("accept"), req.getHeader("if-modified-since")))

server.get("/", (res, req) => utils.streamFile("index.html", res, req.getHeader("accept"), req.getHeader("if-modified-since")))


// fake fs paths
server.get("/.well-known/traffic-advice", res => {
	const data = [{
		user_agent: "prefetch-proxy",
		google_prefetch_proxy_eap: {
			fraction: 1.0
		}
	}]
	const payload = JSON.stringify(data)

	res
		.writeStatus("200")
		.writeHeader("Content-Type", "application/trafficadvice+json") // done because of fancy Content-Type
		.writeHeader("Content-Length", String(Buffer.byteLength(payload)))
		.end(payload)
})

server.get("/commands.json", res => {
	const data = Array.from(commands.commands.values()).map(cmd => ({
		name: cmd.name,
		description: cmd.description,
		integration_types: cmd.integration_types,
		contexts: cmd.contexts,
		options: cmd.options
	}))
	const payload = JSON.stringify(data)

	res
		.writeStatus("200")
		.writeHeader("Content-Type", "application/json")
		.end(payload)
})
