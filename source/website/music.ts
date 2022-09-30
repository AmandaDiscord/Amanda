import constants from "../constants"
import passthrough from "../passthrough"
const { sync, wss, webQueues, configuredUserID, config } = passthrough

const utils: typeof import("./util") = sync.require("./util")
const orm: typeof import("../utils/orm") = sync.require("../utils/orm")

type Packet<T> = {
	op?: number;
	d?: T;
	nonce?: number | null;
}

const opcodeMethodMap = new Map<number, "identify" | "sendState" | "togglePlayback" | "requestSkip" | "requestStop" | "requestAttributesChange" | "requestClearQueue" | "requestTrackRemove" | "acceptData" | "createQueue">([
	[constants.WebsiteOPCodes.IDENTIFY, "identify"],
	[constants.WebsiteOPCodes.STATE, "sendState"],
	[constants.WebsiteOPCodes.TOGGLE_PLAYBACK, "togglePlayback"],
	[constants.WebsiteOPCodes.SKIP, "requestSkip"],
	[constants.WebsiteOPCodes.STOP, "requestStop"],
	[constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, "requestAttributesChange"],
	[constants.WebsiteOPCodes.CLEAR_QUEUE, "requestClearQueue"],
	[constants.WebsiteOPCodes.TRACK_REMOVE, "requestTrackRemove"],

	[constants.WebsiteOPCodes.ACCEPT, "acceptData"],
	[constants.WebsiteOPCodes.CREATE, "createQueue"]
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

export const receivers: {
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

const sessions: Array<Session> = []

export class Session {
	public ws: import("ws").WebSocket
	public loggedin = false
	public channel: string | null = null
	public user: string | null = null

	public constructor(ws: import("ws").WebSocket) {
		this.ws = ws

		ws.on("message", message => {
			try {
				const data = JSON.parse(message.toString()) as Packet<any>
				const method = opcodeMethodMap.get(data.op!)
				if (method) this[method](data)
			} catch (e) {
				utils.info(`${this.user || "Unauthenticated"} sent an invalid JSON:\n${message.toString()}`)
				this.cleanClose()
			}
		})

		ws.on("close", this.onClose.bind(this))

		ws.on("error", utils.error)

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
		if (this.user !== configuredUserID) utils.info(`WebSocket disconnected: ${this.user || "Unauthenticated"}`)
		const index = sessions.indexOf(this)
		sessions.splice(index, 1)
		if (this.user !== configuredUserID) utils.info(`${sessions.length} sessions in memory`)
	}

	public async identify(data: Packet<{ cookie?: string; channel_id?: string; timestamp?: number; token?: string }>): Promise<void> {
		if (this.loggedin) return this.cleanClose()
		if (data && data.d && data.d.timestamp && data.d.token && data.d.token === config.lavalink_password) {
			// Amanda route
			const serverTimeDiff = Date.now() - data.d.timestamp
			this.loggedin = true
			this.user = configuredUserID
			this.send({ op: constants.WebsiteOPCodes.ACKNOWLEDGE, nonce: data.nonce || null, d: { serverTimeDiff } })
		} else if (data && data.d && typeof data.d.cookie === "string" && typeof data.d.channel_id === "string" && typeof data.d.timestamp === "number") {
			const serverTimeDiff = Date.now() - data.d.timestamp
			// Check the user and guild are legit
			const cookies = utils.getCookies({ headers: { cookie: data.d.cookie } } as unknown as import("http").IncomingMessage)
			const session = await utils.getSession(cookies)
			if (!session) return
			const state = await orm.db.get("voice_states", { user_id: session.user_id })
			if (!state) return utils.warn(`Fake user tried to identify:\n${require("util").inspect(session)}`)
			// User and guild are legit
			// We don't assign these variable earlier to defend against multiple identifies
			this.loggedin = true
			this.channel = state.channel_id
			this.user = session.user_id
			utils.info(`WebSocket identified: ${this.user}`)
			utils.info(`${sessions.length} sessions in memory`)
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
		webQueues.get(this.channel!)?.session?.send({ op: constants.WebsiteOPCodes.TOGGLE_PLAYBACK, d: { channel_id: this.channel! } })
	}

	public requestSkip(): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		webQueues.get(this.channel!)?.session?.send({ op: constants.WebsiteOPCodes.SKIP, d: { channel_id: this.channel! } })
	}

	public requestStop(): void {
		const allowed = this.allowedToAction()
		if (!allowed) return
		webQueues.get(this.channel!)?.session?.send({ op: constants.WebsiteOPCodes.STOP, d: { channel_id: this.channel! } })
	}

	public async requestAttributesChange(data: Packet<{ auto?: boolean; loop?: boolean }>) {
		const allowed = this.allowedToAction()
		if (!allowed) return
		if (typeof data === "object" && typeof data.d === "object") {
			if (typeof data.d.auto === "boolean") webQueues.get(this.channel!)?.session?.send({ op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: { auto: data.d.auto, channel_id: this.channel! } })
			if (typeof data.d.loop === "boolean") webQueues.get(this.channel!)?.session?.send({ op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: { loop: data.d.loop, channel_id: this.channel! } })
		}
	}

	public async requestClearQueue() {
		const allowed = this.allowedToAction()
		if (!allowed) return
		webQueues.get(this.channel!)?.session?.send({ op: constants.WebsiteOPCodes.CLEAR_QUEUE, d: { channel_id: this.channel! } })
	}

	public async requestTrackRemove(data: Packet<{ index: number }>) {
		const allowed = this.allowedToAction()
		if (!allowed) return
		if (data && data.d && typeof data.d.index === "number") webQueues.get(this.channel!)?.session?.send({ op: constants.WebsiteOPCodes.TRACK_REMOVE, d: { index: data.d.index } })
	}


	public acceptData(data: Packet<Packet<any> & { channel_id: string }>) {
		if (this.user !== configuredUserID) return
		const queue = webQueues.get(data.d?.channel_id!)
		if (queue) queue.session = this
		if (!queue) utils.warn(`No queue for acceptData! ${JSON.stringify(data.d)}`)
		if (data.d && data.d.op && queue) {
			receivers[data.d.op]?.updateCallback(queue, data.d.d)
			const subscribers = sessions.filter(s => s.channel === data.d!.channel_id && s.user !== configuredUserID)
			for (const subscriber of subscribers) {
				receivers[data.d.op]?.sessionCallback(subscriber, queue, data.d.d)
			}
		}
	}

	public createQueue(data: Packet<import("../types").WebQueue>) {
		if (this.user !== configuredUserID) return
		if (data && data.d && data.d.voiceChannel && data.d.voiceChannel.id && !webQueues.has(data.d.voiceChannel.id)) {
			data.d.session = this
			webQueues.set(data.d.voiceChannel.id, data.d)
			const subscribers = sessions.filter(s => s.channel === data.d!.voiceChannel.id && s.user !== configuredUserID)
			for (const subscriber of subscribers) {
				subscriber.sendState({})
			}
		}
	}
}

function wsConnection(ws: import("ws").WebSocket) {
	return new Session(ws)
}
wss.on("connection", wsConnection)

utils.info("Websocket API loaded")
