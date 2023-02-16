import constants = require("../constants")
import passthrough = require("../passthrough")
const { sync, wss, webQueues, config, sessions } = passthrough

const utils: typeof import("./util") = sync.require("./util")
const orm: typeof import("../client/utils/orm") = sync.require("../client/utils/orm")

type Packet<T> = {
	op?: number;
	d?: T;
	nonce?: number | null;
}

const opcodeMethodMap = new Map<number, "identify" | "sendState" | "togglePlayback" | "requestSkip" | "requestStop" | "requestAttributesChange" | "requestClearQueue" | "requestTrackRemove">([
	[constants.WebsiteOPCodes.IDENTIFY, "identify"],
	[constants.WebsiteOPCodes.STATE, "sendState"],
	[constants.WebsiteOPCodes.TOGGLE_PLAYBACK, "togglePlayback"],
	[constants.WebsiteOPCodes.SKIP, "requestSkip"],
	[constants.WebsiteOPCodes.STOP, "requestStop"],
	[constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, "requestAttributesChange"],
	[constants.WebsiteOPCodes.CLEAR_QUEUE, "requestClearQueue"],
	[constants.WebsiteOPCodes.TRACK_REMOVE, "requestTrackRemove"]
])

type PacketData = {
	position: number
	track: import("../types").PartialTrack
	trackStartTime: number
	pausedAt: number
	playing: boolean
	index: number
	loop: boolean
	auto: boolean
	members: import("../types").WebQueue["members"]
	lengthSeconds: number
	amount: number
}

type Receiver = {
	updateCallback(cache: import("../types").WebQueue, data: PacketData): import("../types").WebQueue;
	sessionCallback(session: Session, cache: import("../types").WebQueue, data: PacketData): void;
}

const receivers: {
	[op: number]: Receiver
} = {
	[constants.WebsiteOPCodes.TRACK_ADD]: {
		updateCallback(cache, { position, track }) {
			cache.tracks.splice(position, 0, track)
			return cache
		},
		sessionCallback(session, _, { position, track }) {
			session.onTrackAdd(track, position)
		}
	},
	[constants.WebsiteOPCodes.TRACK_REMOVE]: {
		updateCallback(cache, { index }) {
			cache.tracks.splice(index, 1)
			return cache
		},
		sessionCallback(session, _, { index }) {
			session.onTrackRemove(index)
		}
	},
	[constants.WebsiteOPCodes.TRACK_UPDATE]: {
		updateCallback(cache, { track, index }) {
			cache.tracks[index] = track
			return cache
		},
		sessionCallback(session, _, { track, index }) {
			session.onTrackUpdate(track, index)
		}
	},
	[constants.WebsiteOPCodes.NEXT]: {
		updateCallback(cache) {
			cache.tracks.shift()
			return cache
		},
		sessionCallback(session) {
			session.onNext()
		}
	},
	[constants.WebsiteOPCodes.TIME_UPDATE]: {
		updateCallback(cache, { trackStartTime, pausedAt, playing }) {
			cache.trackStartTime = trackStartTime
			cache.pausedAt = pausedAt
			cache.playing = playing
			return cache
		},
		sessionCallback(session, _, { trackStartTime, pausedAt, playing }) {
			session.onTimeUpdate({ trackStartTime, pausedAt, playing })
		}
	},
	[constants.WebsiteOPCodes.CLEAR_QUEUE]: {
		updateCallback(cache) {
			cache.tracks.splice(1)
			return cache
		},
		sessionCallback(session) {
			session.onClearQueue()
		}
	},
	[constants.WebsiteOPCodes.LISTENERS_UPDATE]: {
		updateCallback(cache, { members }) {
			cache.members = members
			return cache
		},
		sessionCallback(session, _, { members }) {
			session.onListenersUpdate(members)
		}
	},
	[constants.WebsiteOPCodes.ATTRIBUTES_CHANGE]: {
		updateCallback(cache, attributes) {
			cache.attributes = attributes
			return cache
		},
		sessionCallback(session, _, attributes) {
			session.onAttributesChange(attributes)
		}
	},
	[constants.WebsiteOPCodes.STOP]: {
		updateCallback(cache) {
			webQueues.delete(cache.voiceChannel.id)
			return cache
		},
		sessionCallback(session) {
				session.sendState({})
		}
	}
}

class Session {
	public ws: import("ws").WebSocket
	public loggedin = false
	public channel: string | null = null
	public user: string | null = null
	public shards: Array<number> = []

	public constructor(ws: import("ws").WebSocket) {
		this.ws = ws

		ws.on("message", message => {
			try {
				const data = JSON.parse(message.toString()) as Packet<any>
				const method = opcodeMethodMap.get(data.op!)
				if (method) this[method](data)
			} catch (e) {
				console.log(`${this.user || "Unauthenticated"} sent an invalid JSON:\n${message.toString()}`, e)
				this.cleanClose()
			}
		})

		ws.on("close", this.onClose.bind(this))

		ws.on("error", console.error)

		sessions.push(this)

		setTimeout(() => {
			if (!this.loggedin) this.cleanClose()
		}, 5000)
	}

	public send(data: Packet<unknown>): void {
		const d = JSON.stringify(data)
		this.ws.send(d)
	}

	public onClose(): void {
		console.log(`WebSocket disconnected: ${this.user || "Unauthenticated"}`)
		const index = sessions.indexOf(this)
		sessions.splice(index, 1)
		console.log(`${sessions.length} sessions in memory`)
	}

	public async identify(data: Packet<{ cookie?: string; channel_id?: string; timestamp?: number; token?: string }>): Promise<void> {
		if (this.loggedin) return this.cleanClose()
		if (data && data.d && typeof data.d.cookie === "string" && typeof data.d.channel_id === "string" && typeof data.d.timestamp === "number") {
			const serverTimeDiff = Date.now() - data.d.timestamp
			// Check the user and guild are legit
			const cookies = utils.getCookies({ headers: { cookie: data.d.cookie } } as unknown as import("http").IncomingMessage)
			const session = await utils.getSession(cookies)
			if (!session) return
			if (!config.db_enabled) return
			const state = await orm.db.get("voice_states", { channel_id: data.d.channel_id, user_id: session.user_id })
			if (!state) return console.warn(`Fake user tried to identify:\n${require("util").inspect(session)}`)
			// User and guild are legit
			// We don't assign these variable earlier to defend against multiple identifies
			this.loggedin = true
			this.channel = state.channel_id
			this.user = session.user_id
			console.log(`WebSocket identified: ${this.user}`)
			console.log(`${sessions.length} sessions in memory`)
			this.send({ op: constants.WebsiteOPCodes.ACKNOWLEDGE, nonce: data.nonce || null, d: { serverTimeDiff } })
			this.sendState({})
		}
	}

	public sendState(data?: Packet<unknown>): void {
		if (!this.loggedin) return
		const state = webQueues.get(this.channel!) ? Object.assign({}, webQueues.get(this.channel!)) : null
		if (state) delete state["session"] // deletes off dupe to not mutate stored state
		let nonce: number | null = null
		if (data && typeof data.nonce === "number") nonce = data.nonce
		this.send({ op: constants.WebsiteOPCodes.STATE, nonce: nonce, d: state })
	}

	public cleanClose(): void {
		this.send({ op: constants.WebsiteOPCodes.STATE, d: null })
		this.ws.close()
	}


	public onTrackAdd(track: import("../types").PartialTrack, position: number): void {
		this.send({ op: constants.WebsiteOPCodes.TRACK_ADD, d: { track, position } })
	}

	public onTrackRemove(index: number): void {
		this.send({ op: constants.WebsiteOPCodes.TRACK_REMOVE, d: { index } })
	}

	public onTrackUpdate(track: import("../types").PartialTrack, index: number ): void {
		this.send({ op: constants.WebsiteOPCodes.TRACK_UPDATE, d: { track, index } })
	}

	public onClearQueue(): void {
		this.send({ op: constants.WebsiteOPCodes.CLEAR_QUEUE })
	}

	public onNext(): void {
		this.send({ op: constants.WebsiteOPCodes.NEXT })
	}

	public onListenersUpdate(members: import("../types").WebQueue["members"]): void {
		this.send({ op: constants.WebsiteOPCodes.LISTENERS_UPDATE, d: { members } })
	}

	public onAttributesChange(attributes: import("../types").WebQueue["attributes"]) {
		this.send({ op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: attributes })
	}

	public onTimeUpdate(info: { trackStartTime: number, pausedAt: number, playing: boolean }): void {
		this.send({ op: constants.WebsiteOPCodes.TIME_UPDATE, d: info })
	}


	public allowedToAction(): boolean {
		if (!this.loggedin) return false
		const state = webQueues.get(this.channel!)!
		if (!state) return false
		if (!state.members.find(i => i.id === this.user)) return false
		return true
	}

	public togglePlayback(): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		passthrough.amqpChannel?.sendToQueue(config.amqp_music_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.TOGGLE_PLAYBACK, t: "AMANDA_WEBSITE_MESSAGE", d: { channel_id: this.channel! } })))
	}

	public requestSkip(): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		passthrough.amqpChannel?.sendToQueue(config.amqp_music_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.SKIP, t: "AMANDA_WEBSITE_MESSAGE", d: { channel_id: this.channel! } })))
	}

	public requestStop(): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		passthrough.amqpChannel?.sendToQueue(config.amqp_music_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.STOP, t: "AMANDA_WEBSITE_MESSAGE", d: { channel_id: this.channel }})))
	}

	public async requestAttributesChange(data: Packet<{ loop?: boolean }>) {
		const allowed = this.allowedToAction()
		if (!allowed) return
		if (typeof data === "object" && typeof data.d === "object") {
			if (typeof data.d.loop === "boolean") passthrough.amqpChannel?.sendToQueue(config.amqp_music_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, t: "AMANDA_WEBSITE_MESSAGE", d: { loop: data.d.loop, channel_id: this.channel }})))
		}
	}

	public async requestClearQueue() {
		const allowed = this.allowedToAction()
		if (!allowed) return
		passthrough.amqpChannel?.sendToQueue(config.amqp_music_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.CLEAR_QUEUE, t: "AMANDA_WEBSITE_MESSAGE", d: { channel_id: this.channel! } })))
	}

	public async requestTrackRemove(data: Packet<{ index: number }>) {
		const allowed = this.allowedToAction()
		if (!allowed) return
		if (data && data.d && typeof data.d.index === "number") passthrough.amqpChannel?.sendToQueue(config.amqp_music_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.TRACK_REMOVE, t: "AMANDA_WEBSITE_MESSAGE", d: { channel_id: this.channel!, index: data.d.index } })))
	}
}

function wsConnection(ws: import("ws").WebSocket) {
	return new Session(ws)
}
sync.addTemporaryListener(wss, "connection", wsConnection)

console.log("Websocket API loaded")

export = { receivers, Session }
