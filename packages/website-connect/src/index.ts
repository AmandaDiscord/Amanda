/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventEmitter } from "events"

import { WebSocket } from "ws"

import type ConfigProvider = require("@amanda/config")

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

	public constructor(public confprovider: ConfigProvider, path: "/internal" | "/gateway") {
		super()
		const protocol = confprovider.config.website_protocol === "https"
			? "wss://"
			: "ws://"

		this._createWS(protocol, path)
		this.on("close", () => {
			this.ws.removeAllListeners()
			setTimeout(() => {
				this._createWS(protocol, path)
			}, 5000)
		})
	}

	private _createWS(protocol: "wss://" | "ws://", path: "/internal" | "/gateway"): void {
		this.ws = new WebSocket(`${protocol}${this.confprovider.config.website_domain}${path}`, {
			headers: {
				Authorization: this.confprovider.config.current_token,
				"X-Cluster-Id": this.confprovider.config.cluster_id
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
