import { EventEmitter } from "events"

import { BetterWs } from "cloudstorm"

import confprovider = require("@amanda/config")

/**
 * Websocket backed connector for Amanda internal communication
 */
class Connector extends EventEmitter {
	/** The backing websocket */
	private readonly ws: BetterWs
	/** A queue of functions to be run after connection resumes */
	private readonly queue: Array<{ res: (() => void), data: any }> = []

	public constructor(path: "/internal" | "/gateway") {
		super()

		this.ws = new BetterWs(`${confprovider.config.ipc_protocol}://${confprovider.config.ipc_bind}${path}`, {
			headers: {
				Authorization: confprovider.config.current_token,
				"X-Cluster-Id": confprovider.config.cluster_id
			},
			bypassBuckets: true,
			encoding: "json",
			connectThrottle: 5000
		})

		this.ws.on("ws_receive", data => this.emit("message", data))
		this.ws.on("ws_open", () => void this.onOpen())
		this.ws.on("ws_close", (code, reason) => {
			this.emit("close", code, reason)
			setImmediate(() => this._connect())
		})
		this.ws.on("error", console.error)
		this._connect()
	}

	private _connect() {
		this.ws.connect()
	}

	/**
	 * Send a JSON message to the websocket server
	 * @param data Anything that can be JSON.stringify()'d
	 */
	public send(data: any): Promise<void> {
		return new Promise(res => {
			if (this.ws.sm.currentStateName === "connected") {
				this.ws.sendMessage(data)
				res(void 0)
			}
			else this.queue.push({ res, data })
		})
	}

	private async onOpen(): Promise<void> {
		this.emit("open")
		let item = this.queue.shift()
		while (item) {
			if (this.ws.sm.currentStateName !== "connected") return
			await this.send(item.data)
			item.res()
			item = this.queue.shift()
		}
	}
}

export = Connector
