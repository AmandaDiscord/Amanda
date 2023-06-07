/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventEmitter } from "events"

import { WebSocket } from "ws"

import confprovider = require("@amanda/config")

type BufferLike =
	| string
	| Buffer
	| DataView
	| number
	| ArrayBufferView
	| Uint8Array
	| ArrayBuffer
	| SharedArrayBuffer
	| ReadonlyArray<any>
	| ReadonlyArray<number>
	| { valueOf(): ArrayBuffer }
	| { valueOf(): SharedArrayBuffer }
	| { valueOf(): Uint8Array }
	| { valueOf(): ReadonlyArray<number> }
	| { valueOf(): string }
	| { [Symbol.toPrimitive](hint: string): string };

class Connector extends EventEmitter {
	private ws: WebSocket
	private queue: Array<{ res: (() => void), data: BufferLike }> = []

	public constructor(path: "/internal" | "/gateway") {
		super()

		this._createWS(path)
		this.on("close", () => {
			this.ws.removeAllListeners()
			setTimeout(() => {
				this._createWS(path)
			}, 5000)
		})
	}

	private _createWS(path: "/internal" | "/gateway"): void {
		this.ws = new WebSocket(`${confprovider.config.ipc_protocol}://${confprovider.config.ipc_bind}${path}`, {
			headers: {
				Authorization: confprovider.config.current_token,
				"X-Cluster-Id": confprovider.config.cluster_id
			}
		})

		this.ws.on("message", (data, isBinary) => this.emit("message", data, isBinary))
		this.ws.once("open", () => void this.onOpen())
		this.ws.once("close", (code, reason) => this.emit("close", code, reason))
		this.ws.on("error", e => (e as unknown as { code: string }).code === "ECONNREFUSED" ? void 0 : console.error(e))
	}

	public send(data: BufferLike): Promise<void> {
		return new Promise(res => {
			if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data, () => res())
			else this.queue.push({ res, data })
		})
	}

	private async onOpen(): Promise<void> {
		this.emit("open")
		for (const item of this.queue) {
			if (this.ws.readyState !== WebSocket.OPEN) return
			await this.send(item.data)
			item.res()
		}
	}
}

export = Connector
