import { EventEmitter } from "events"

import { BetterWs } from "cloudstorm"

import confprovider = require("@amanda/config")

class Connector extends EventEmitter {
	private ws: BetterWs
	private queue: Array<{ res: (() => void), data: any }> = []

	public constructor(path: "/internal" | "/gateway") {
		super()

		this.ws = new BetterWs(`${confprovider.config.ipc_protocol}://${confprovider.config.ipc_bind}${path}`, {
			headers: {
				Authorization: confprovider.config.current_token,
				"X-Cluster-Id": confprovider.config.cluster_id
			},
			bypassBuckets: true,
			encoding: "json"
		})

		this.ws.on("ws_receive", data => this.emit("message", data))
		this.ws.on("ws_open", () => void this.onOpen())
		this.ws.on("ws_close", (code, reason) => this.emit("close", code, reason))
		this.ws.on("debug", console.error)
		this.on("close", () => {
			setTimeout(() => this._connect(), 5000)
		})
		this._connect()
	}

	private _connect() {
		this.ws.connect().catch(() => {
			setTimeout(() => this._connect(), 5000)
		})
	}

	public send(data: any): Promise<void> {
		return new Promise(res => {
			if (this.ws.status === 1) this.ws.sendMessage(data).then(res)
			else this.queue.push({ res, data })
		})
	}

	private async onOpen(): Promise<void> {
		this.emit("open")
		let item = this.queue.shift()
		while (item) {
			if (this.ws.status !== 1) return
			await this.send(item.data)
			item.res()
			item = this.queue.shift()
		}
	}
}

export = Connector
