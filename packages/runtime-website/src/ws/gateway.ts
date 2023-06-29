import passthrough = require("../passthrough")
const { server, confprovider, gatewayWorkers, sync } = passthrough

import type { WebSocket, WebSocketBehavior } from "uWebSockets.js"

const utils: typeof import("../utils") = sync.require("../utils")

export class GatewayWorker {
	public shards: Array<number> = []

	public constructor(public ws: WebSocket<unknown>, public clusterID: string) {
		gatewayWorkers[clusterID] = this
		console.log(`${clusterID} gateway cluster identified. ${Object.keys(gatewayWorkers).length} total clusters`)
	}

	public send(data: object): void {
		const str = JSON.stringify(data)
		const result = this.ws.send(str)
		if (result === 2) console.error("message dropped due to backpressure limit")
		else if (result === 0) console.warn("message was added to a queue that will drain over time due to backpressure")
		else if (result === 1) console.log("[GW =>]", str)
	}

	public onClose(): void {
		delete gatewayWorkers[this.clusterID]
		console.log(`${this.clusterID} gateway cluster disconnected. ${Object.keys(gatewayWorkers).length} total clusters`)
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
	message(ws, message, isBinary) {
		utils.onGatewayMessage(ws, message, isBinary)
	}
} as WebSocketBehavior<{ worker: GatewayWorker, clusterID: string }>)

console.log("Gateway websocket API loaded")
