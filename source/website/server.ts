import http from "http"
import p from "path"
import fs from "fs"
import Sync from "heatsync"
import mime from "mime-types"

import passthrough from "../passthrough"
const config: import("../types").Config = require("../../config")

const sync = new Sync()

Object.assign(passthrough, { config, sync })

import logger from "./logger"

const rootFolder = p.join(__dirname, "../../webroot")

const paths: typeof import("./paths") = sync.require("./paths")

async function streamResponse(res: import("http").ServerResponse, fileDir: string, headersOnly = false): Promise<void> {
	let stats: import("fs").Stats
	try {
		stats = await fs.promises.stat(fileDir)
	} catch {
		res.writeHead(404).end()
		return
	}

	if (!stats.isFile()) return void res.writeHead(404).end()

	const type = mime.lookup(fileDir) || "application/octet-stream"
	res.writeHead(200, { "Content-Length": stats.size, "Content-Type": type })

	if (headersOnly) return void res.end()

	const stream = fs.createReadStream(fileDir)
	stream.pipe(res)
	stream.once("end", res.end.bind(res))
}

const server = http.createServer(async (req, res) => {
	try {
		const url = new URL(req.url!, `${config.website_protocol}://${req.headers.host}`)
		const path = paths[url.pathname]
		if (path) {
			if (!path.methods.includes(req.method?.toUpperCase()!)) res.writeHead(405).end()
			else {
				if (path.static) await streamResponse(res, p.join(rootFolder, path.static), req.method?.toUpperCase() === "HEAD")
				else if (path.handle) await path.handle(req, res, url)
				else res.writeHead(500).end()
			}
		} else {
			const fileDir = p.join(rootFolder, url.pathname)
			await streamResponse(res, fileDir)
		}
	} catch (e) {
		if (!res.writable) return
		res.writeHead(500, { "Content-Type": "text/plain" }).end(String(e))
	}

	logger.info(`${res.statusCode || "000"} ${req.method?.toLocaleUpperCase() || "UNK"} ${req.url} --- ${req.headers["x-forwarded-for"] || req.socket.remoteAddress}`);
})

server.once("listening", () => logger.info(`Server is listening on ${config.website_domain}`))

server.listen(10400)
