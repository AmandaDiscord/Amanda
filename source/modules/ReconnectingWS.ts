import * as ws from "ws"
import { EventEmitter } from "events"

class ReconnectingWS extends EventEmitter {
	public ws: import("ws").WebSocket
	public address: string
	public timeout: number

	public constructor(address: string, timeout: number) {
		super()
		this.address = address
		this.timeout = timeout
		this.connect()
	}

	public connect() {
		this.ws = new ws.default(this.address)
		this.addEvents()
	}

	public send(data: any, callback?: (err?: Error) => void) {
		this.ws.send(data, callback)
	}

	private addEvents() {
		const onOpen = (() => this.emit("open")).bind(this)
		const onError = () => void 0
		const onMessage = ((data: Buffer | ArrayBuffer | Array<Buffer>, isBinary: boolean) => this.emit("message", data, isBinary)).bind(this)
		const onClose = ((code: number, reason: Buffer) => {
			this.emit("close", code, reason)
			this.ws.removeListener("open", onOpen)
			this.ws.removeListener("error", onError)
			this.ws.removeListener("close", onClose)
			this.ws.removeListener("message", onMessage)
			setTimeout(() => this.connect(), this.timeout)
		}).bind(this)
		this.ws.once("open", onOpen)
		this.ws.once("close", onClose)
		this.ws.on("error", onError)
		this.ws.on("message", onMessage)
	}
}

export = ReconnectingWS
