import passthrough = require("../passthrough")
const { server, confprovider, gatewayWorkers, sync } = passthrough

import type { WebSocket, WebSocketBehavior } from "uWebSockets.js"

const utils: typeof import("../utils") = sync.require("../utils")

export class GatewayWorker {
	public shards = new Set<number>()

	public constructor(public ws: WebSocket<unknown>, public clusterID: string) {
		gatewayWorkers.set(clusterID, this)
		console.log(`${clusterID} gateway cluster identified. ${gatewayWorkers.size} total clusters`)
	}

	public send(data: object): void {
		const str = JSON.stringify(data)
		const result = this.ws.send(str)

		switch (result) {
		case 0:
			console.warn("message was added to a queue that will drain over time due to backpressure")
			break

		case 1: break

		case 2:
			console.error("message dropped due to backpressure limit")
			break

		default:
			console.warn("NOTHING HAPPENED???")
			break
		}
	}

	public onClose(): void {
		gatewayWorkers.delete(this.clusterID)
		console.log(`${this.clusterID} gateway cluster disconnected. ${gatewayWorkers.size} total clusters`)
	}
}

server.ws("/gateway", {
	maxPayloadLength: 1024 * 1024,

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
		res.upgrade({ worker: void 0, clusterID }, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context)
	},
	open(ws) {
		const data = ws.getUserData()
		const worker = new GatewayWorker(ws, data.clusterID)
		data.worker = worker
	},
	close(ws, code, message) {
		console.log(code, Buffer.from(message).toString("utf8"))
		ws.getUserData().worker.onClose()
	},
	message(ws, message) {
		utils.onGatewayMessage(ws, message)
	}
} as WebSocketBehavior<{ worker: GatewayWorker, clusterID: string }>)

console.log("Gateway websocket API loaded")
