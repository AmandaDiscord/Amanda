import passthrough = require("../passthrough")
const { server, confprovider, commandWorkers } = passthrough

import type { WebSocket, WebSocketBehavior } from "uWebSockets.js"

export class CommandWorker {
	public constructor(public ws: WebSocket<unknown>, public clusterID: string) {
		commandWorkers.push(this)
		console.log(`${this.clusterID} command worker connected. ${commandWorkers.length} total workers`)
	}

	public send(data: object): void {
		this.ws.send(JSON.stringify(data))
	}

	public onClose(): void {
		const index = commandWorkers.indexOf(this)
		if (index !== -1) commandWorkers.splice(index, 1)
		console.log(`${this.clusterID} command worker disconnected. ${commandWorkers.length} total workers`)
	}
}

server.ws("/internal", {
	upgrade(res, req, context) {
		const secWebSocketKey = req.getHeader("sec-websocket-key")
		const secWebSocketProtocol = req.getHeader("sec-websocket-protocol")
		const secWebSocketExtensions = req.getHeader("sec-websocket-extensions")

		const auth = req.getHeader("authorization")
		const clusterID = req.getHeader("x-cluster-id")
		if (auth !== confprovider.config.current_token || !clusterID) {
			res.writeStatus("401 Unauthorized")
			return void res.endWithoutBody()
		}

		res.writeStatus("101 Switching Protocols")
		res.upgrade({ worker: undefined, clusterID }, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context)
	},
	open(ws) {
		const data = ws.getUserData()
		const worker = new CommandWorker(ws, data.clusterID)
		data.worker = worker
	},
	close(ws) {
		ws.getUserData().worker.onClose()
	}
} as WebSocketBehavior<{ worker: CommandWorker, clusterID: string }>)

console.log("Internal websocket API loaded")
