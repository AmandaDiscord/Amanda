import passthrough = require("../passthrough")
const { sync, server, confprovider, sql, queues, sessions, sessionGuildIndex } = passthrough

import type { Queue } from "../music/queue"
import type { Track } from "../music/tracktypes"
import type { WebSocket, WebSocketBehavior } from "uWebSockets.js"

const utils: typeof import("../utils") = sync.require("../utils")

const opcodes = {
	IDENTIFY: 1,
	ACKNOWLEDGE: 2,
	STATE: 3,
	TRACK_ADD: 4,
	TRACK_REMOVE: 5,
	TRACK_UPDATE: 6,
	NEXT: 7,
	TIME_UPDATE: 8,
	TOGGLE_PLAYBACK: 9,
	SKIP: 10,
	STOP: 11,
	ATTRIBUTES_CHANGE: 12,
	CLEAR_QUEUE: 13,
	LISTENERS_UPDATE: 14,
	TRACK_PLAY_NOW: 15,
	SEEK: 16
}

type Packet<T> = {
	op?: number;
	d?: T;
	nonce?: number | null;
}

const opcodeMethodMap = new Map<number, "identify" | "sendState" | "togglePlayback" | "requestSkip" | "requestStop" | "requestAttributesChange" | "requestClearQueue" | "requestTrackRemove" | "requestPlayNow" | "requestSeek">([
	[opcodes.IDENTIFY, "identify"],
	[opcodes.STATE, "sendState"],
	[opcodes.TOGGLE_PLAYBACK, "togglePlayback"],
	[opcodes.SKIP, "requestSkip"],
	[opcodes.STOP, "requestStop"],
	[opcodes.ATTRIBUTES_CHANGE, "requestAttributesChange"],
	[opcodes.CLEAR_QUEUE, "requestClearQueue"],
	[opcodes.TRACK_REMOVE, "requestTrackRemove"],
	[opcodes.TRACK_PLAY_NOW, "requestPlayNow"],
	[opcodes.SEEK, "requestSeek"]
])


export class Session {
	public loggedin = false
	public guild: string | null = null
	public user: string | null = null
	private closed = false

	public constructor(public ws: WebSocket<unknown>) {
		setTimeout(() => {
			if (!this.loggedin) this.cleanClose()
		}, 5000)
	}

	public send(data: Packet<unknown>): void {
		if (this.closed) return
		const d = JSON.stringify(data)
		const result = this.ws.send(d)

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
		this.closed = true
		this.loggedin = false
		console.log(`WebSocket disconnected: ${this.user ?? "Unauthenticated"}`)
		if (this.user) sessions.delete(this.user)
		if (this.user && this.guild) {
			sessionGuildIndex.get(this.guild)?.delete(this.user)
			if (!sessionGuildIndex.get(this.guild)?.size) sessionGuildIndex.delete(this.guild)
		}
		console.log(`${sessions.size} sessions in memory`)
	}

	public async identify(data: Packet<{ cookie?: string; channel_id?: string; timestamp?: number; token?: string }>): Promise<void> {
		if (this.loggedin) return this.cleanClose()
		if (data?.d && typeof data.d.cookie === "string" && typeof data.d.channel_id === "string" && typeof data.d.timestamp === "number") {
			const serverTimeDiff = Date.now() - data.d.timestamp
			// Check the user and guild are legit
			const cookies = utils.getCookies(data.d.cookie)
			const session = await utils.getSession(cookies)
			if (!session) return
			if (!confprovider.config.db_enabled) return
			const state = await sql.orm.get("voice_states", { channel_id: data.d.channel_id, user_id: session.user_id })
			if (!state) return console.warn(`Fake user tried to identify:\n${require("util").inspect(session)}`)
			if (sessions.has(session.user_id)) return console.warn(`User tried to identify multiple times:\n${require("util").inspect(session)}`)
			// User and guild are legit
			// We don't assign these variable earlier to defend against multiple identifies
			this.loggedin = true
			this.guild = state.guild_id
			this.user = session.user_id
			sessions.set(this.user, this)
			const existing = sessionGuildIndex.get(this.guild) ?? new Set()
			existing.add(this.user)
			sessionGuildIndex.set(this.guild, existing)
			console.log(`WebSocket identified: ${this.user}`)
			console.log(`${sessions.size} sessions in memory`)
			this.send({ op: opcodes.ACKNOWLEDGE, nonce: data.nonce ?? null, d: { serverTimeDiff } })
			this.sendState()
		}
	}

	public sendState(data?: Packet<unknown>): void {
		if (!this.loggedin) return
		const state = queues.get(this.guild!) ?? null
		let nonce: number | null = null
		if (data && typeof data.nonce === "number") nonce = data.nonce
		this.send({ op: opcodes.STATE, nonce: nonce, d: state?.toJSON() ?? null })
	}

	public cleanClose(): void {
		if (this.closed) return
		this.send({ op: opcodes.STATE, nonce: null, d: null })
		this.ws.close()
	}


	public onTrackAdd(track: Track, position: number): void {
		this.send({ op: opcodes.TRACK_ADD, d: { track: track.toObject(), position } })
	}

	public onTrackRemove(index: number): void {
		this.send({ op: opcodes.TRACK_REMOVE, d: { index } })
	}

	public onTrackUpdate(track: Track, index: number): void {
		this.send({ op: opcodes.TRACK_UPDATE, d: { track: track.toObject(), index } })
	}

	public onClearQueue(): void {
		this.send({ op: opcodes.CLEAR_QUEUE })
	}

	public onNext(): void {
		this.send({ op: opcodes.NEXT })
	}

	public onListenersUpdate(members: ReturnType<Queue["toJSON"]>["members"]): void {
		this.send({ op: opcodes.LISTENERS_UPDATE, d: { members: members } })
	}

	public onAttributesChange(queue: Queue): void {
		this.send({ op: opcodes.ATTRIBUTES_CHANGE, d: { loop: queue.loop } })
	}

	public onTimeUpdate(info: { trackStartTime: number, pausedAt: number, playing: boolean }): void {
		this.send({ op: opcodes.TIME_UPDATE, d: info })
	}

	public onStop(): void {
		this.send({ op: opcodes.STATE, nonce: null, d: null })
	}


	public allowedToAction(): boolean {
		if (!this.loggedin) return false
		const state = queues.get(this.guild!)
		if (!state) return false
		if (!state.listeners.has(this.user!)) return false
		return true
	}

	public togglePlayback(): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		const q = queues.get(this.guild!)
		if (!q) return this.cleanClose()
		q.paused = !q.paused
	}

	public requestSkip(): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		const q = queues.get(this.guild!)
		if (!q) return this.cleanClose()
		q.skip()
	}

	public requestStop(): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		const q = queues.get(this.guild!)
		if (!q) return this.cleanClose()
		q.destroy(true)
	}

	public requestAttributesChange(data: Packet<{ loop?: boolean }>): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		const q = queues.get(this.guild!)
		if (!q) return this.cleanClose()
		if (typeof data?.d?.loop === "boolean") q.loop = data.d.loop
	}

	public requestClearQueue(): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		const q = queues.get(this.guild!)
		if (!q) return this.cleanClose()
		q.tracks.splice(1, q.tracks.length - 1)
		this.onClearQueue()
	}

	public requestTrackRemove(data: Packet<{ index: number }>): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		const q = queues.get(this.guild!)
		if (!q) return this.cleanClose()
		if (typeof data?.d?.index === "number") q.removeTrack(data.d.index)
	}

	public requestPlayNow(data: Packet<{ index: number }>): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		const q = queues.get(this.guild!)
		if (!q) return this.cleanClose()
		if (typeof data?.d?.index === "number") {
			if (data.d.index === 0) return
			if (!q.tracks[data.d.index]) return
			const tracks = q.tracks.splice(data.d.index, 1)
			q.tracks.splice(1, 0, ...tracks)
			q.skip()
			this.sendState()
		}
	}

	public async requestSeek(data: Packet<{ time: 0 }>): Promise<void> {
		const allowed = this.allowedToAction()
		if (!allowed) return
		const q = queues.get(this.guild!)
		if (!q) return this.cleanClose()
		if (typeof data?.d?.time === "number") {
			const result = await q.seek(data.d.time)
			if (result === 3) this.cleanClose()
		}
	}
}

server.ws("/public", {
	upgrade(res, req, context) {
		const secWebSocketKey = req.getHeader("sec-websocket-key")
		const secWebSocketProtocol = req.getHeader("sec-websocket-protocol")
		const secWebSocketExtensions = req.getHeader("sec-websocket-extensions")

		res.writeStatus("101 Switching Protocols")
		res.upgrade({ session: void 0 }, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context)
	},
	open(ws) {
		const session = new Session(ws)
		ws.getUserData().session = session
	},
	async message(ws, message) {
		const msg = Buffer.from(message).toString()
		const session = ws.getUserData().session
		try {
			const data = JSON.parse(msg) as Packet<any>
			const method = opcodeMethodMap.get(data.op!)
			if (method) await session[method](data)
		} catch (e) {
			console.log(`${session.user ?? "Unauthenticated"} sent an invalid JSON:\n${msg}`, e)
			session.cleanClose()
		}
	},
	close(ws) {
		ws.getUserData().session.onClose()
	}
} as WebSocketBehavior<{ session: Session }>)

console.log("Public websocket API loaded")
