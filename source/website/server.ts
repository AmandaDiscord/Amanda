import http from "http"
import p from "path"
import fs from "fs"
import Sync from "heatsync"
import mime from "mime-types"

import passthrough from "../passthrough"
const config: import("../types").Config = require("../../config")

const sync = new Sync()

Object.assign(passthrough, { config, sync })

import logger from "../utils/logger"


const host = config.website_domain.split(":")
const port = Number(host[1])
const rootFolder = p.join(__dirname, "../../webroot")

const paths: typeof import("./paths") = sync.require("./paths")

async function streamResponse(res: import("http").ServerResponse, fileDir: string): Promise<void> {
	let stats: import("fs").Stats
	try {
		stats = await fs.promises.stat(fileDir)
	} catch {
		res.writeHead(404).end()
		return
	}

	if (stats.isDirectory() || stats.isSymbolicLink()) {
		res.writeHead(404).end()
		return
	}

	const type = mime.lookup(fileDir) || "application/octet-stream"
	res.writeHead(200, {
		"Content-Length": stats.size,
		"Content-Type": type
	})

	const stream = fs.createReadStream(fileDir)
	stream.pipe(res)
	stream.once("end", res.end.bind(res))
}

const server = http.createServer(async (req, res) => {
	try {
		logger.info(req.url)
		const url = new URL(req.url!, `${config.website_protocol}://${req.headers.host}`)
		const path = paths[url.pathname]
		if (path) {
			if (!path.methods.includes(req.method?.toUpperCase()!)) return res.writeHead(405).end()
			if (path.static) await streamResponse(res, p.join(rootFolder, path.static))
			else if (path.handle) await path.handle(req, res, url)
			else return res.writeHead(500, { "Content-Type": "text/plain" }).end()
		} else {
			const fileDir = p.join(rootFolder, url.pathname)
			await streamResponse(res, fileDir)
		}
	} catch (e) {
		if (!res.writable) return
		res.writeHead(500, { "Content-Type": "text/plain" })
		res.write(String(e))
		res.end()
	}
})

server.once("listening", () => logger.info(`Server is listening on ${config.website_domain}`))

server.listen(port, host[0])
