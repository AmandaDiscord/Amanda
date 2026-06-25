import { EventEmitter } from "node:events"

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
	 * @param timeoutMs How long to wait for a connection to resume before giving up, if not currently connected
	 */
	public send(data: any, timeoutMs = 30000): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.ws.sm.currentStateName === "connected") {
				this.ws.sendMessage(data)
				resolve(void 0)
				return
			}

			const entry: { res: () => void; data: any } = {
				data,
				res: () => {
					clearTimeout(timeout)
					resolve(void 0)
				}
			}
			const timeout = setTimeout(() => {
				const index = this.queue.indexOf(entry)
				if (index !== -1) this.queue.splice(index, 1)
				reject(new Error("Timed out waiting for the connection to resume before the message could be sent"))
			}, timeoutMs)

			this.queue.push(entry)
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
