import { createServer } from "http"
import * as ws from "ws"
import crypto from "crypto"

import passthrough from "./passthrough"
const { config, sync } = passthrough

const server = createServer(serverHandler)
const wss = new ws.Server({ noServer: true })

const epoch = BigInt("1420070400000")
const workerID = 1
const pid = process.pid
let increment = 1

function generateSnowflake() {
	return (((BigInt(Date.now()) - epoch) << BigInt(22)) | ((BigInt(workerID) & BigInt(0b11111)) << BigInt(17)) | ((BigInt(pid) & BigInt(0b11111)) << BigInt(12)) | BigInt(increment++)).toString()
}

server.on("upgrade", (req, socket, head) => {
	wss.handleUpgrade(req, socket, head, s => {
		wss.emit("connection", s, req)
	})
})

// http

type Path = {
	methods: Array<string>;
	handle(req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL): void | Promise<void>;
}

function checkAuth(req: import("http").IncomingMessage) {
	return req.headers["authorization"] === `Bot ${config.bot_token}`
}

const pts: {
	[path: string]: Path
} = {
	"/api/v10/gateway/bot": {
		methods: ["GET"],
		handle(req, res) {
			if (!checkAuth(req)) return void res.writeHead(401).end()
			res.writeHead(200, undefined, { "Content-Type": "application/json" }).end(JSON.stringify({ url: "ws://localhost:10430/", shards: 1, session_start_limit: { total: 1000, remaining: 999, reset_after: 14400000, max_concurrency: 1 } }))
		}
	}
}

const interactions: { [key: string]: import("discord-typings").Interaction } = {}

const routes: {
	[route: string]: {
		methods: Array<string>;
		router: (req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL, ...params: Array<string>) => void | Promise<void>;
	}
} = {
	"/api/v10/channels/(\\d+)/messages": {
		methods: ["GET", "POST"],
		router(req, res) {
			if (!checkAuth(req)) return void res.writeHead(401).end()
			res.writeHead(200).end("{}")
		}
	},
	"/api/v10/webhooks/(\\d+)/(\\w+)": {
		methods: ["POST"],
		router(req, res, url, appID, token) {
			if (!checkAuth(req)) return void res.writeHead(401).end()
			if (!interactions[`${appID}_${token}`]) return void res.writeHead(404).end(JSON.stringify({}))
			res.writeHead(200).end(JSON.stringify({}))
		}
	},
	"/api/v10/webhooks/(\\d+)/(\\w+)/messages/@original": {
		methods: ["PATCH"],
		router(req, res, url, appID, token) {
			if (!checkAuth(req)) return void res.writeHead(401).end()
			if (!interactions[`${appID}_${token}`]) return void res.writeHead(404).end(JSON.stringify({}))
			res.writeHead(200).end(JSON.stringify({}))
		}
	},
	"/api/v10/interactions/(\\d+)/(\\w+)/callback": {
		methods: ["POST"],
		router(req, res, url, interactionID, token) {
			if (!checkAuth(req)) return void res.writeHead(401).end()
			const interaction = interactions[`${interactionID}_${token}`]
			if (!interaction) return void res.writeHead(404).end(JSON.stringify({}))
			interactions[`${interaction.application_id}_${token}`] = interactions[`${interactionID}_${token}`]
			res.writeHead(200).end(JSON.stringify({}))
		}
	},
	"/api/v10/users/(\\d+)": {
		methods: ["GET"],
		router(req, res, url, userID) {
			if (!checkAuth(req)) return void res.writeHead(401).end()
			let user: import("discord-typings").User
			if (userID === TestUser.id) user = TestUser
			else if (userID === AmandaUser.id) user = AmandaUser
			else return void res.writeHead(404).end(JSON.stringify({}))
			res.writeHead(200).end(JSON.stringify(user))
		}
	}
}

const digitString = "(\\d+)"
const wordString = "(\\w+)"

type Folder = {
	regex?: RegExp;
	route?: string;
	[wordString]?: Folder;
	[digitString]?: Folder;
}

const folders: Folder = {}

const compiledRegexes = {} as { [route: string]: RegExp }

function getRouteFromFolders(steps: Array<string>): { regex: RegExp; route: string } | null {
	let current = folders
	for (const step of steps) {
		if (!current) return null
		if (current[digitString] && !isNaN(Number(step))) current = current[digitString]
		else if (current[wordString]) current = current[wordString]
		else if (current[step]) current = current[step]
		else return null
	}
	if (!current.regex || !current.route) return null
	return { regex: current.regex, route: current.route }
}

const slash = /\//g
const plus = /\+/g
const equals = /=/g

for (const key of Object.keys(routes)) {
	compiledRegexes[key] = new RegExp(key)
	const split = key.split(slash).slice(1)
	let previous = folders
	for (let i = 0; i < split.length; i++) {
		const path = split[i]
		if (!previous[path]) previous[path] = {}
		if (i === split.length - 1) {
			previous[path].regex = compiledRegexes[key]
			previous[path].route = key
		}
		previous = previous[path]
	}
}

const paths = new Proxy(pts, {
	get(target, property, receiver) {
		const existing = Reflect.get(target, property, receiver)
		if (existing) return existing
		const prop = property.toString()
		const split = prop.split(slash).slice(1)
		const pt = getRouteFromFolders(split)
		if (!pt) return void 0
		const match = prop.match(pt.regex)
		if (!match) return null
		const params = match.slice(1)
		return {
			methods: routes[pt.route].methods,
			handle: (req, res, url) => routes[pt.route].router(req, res, url, ...params)
		} as Path
	}
})

async function serverHandler(req: import("http").IncomingMessage, res: import("http").ServerResponse) {
	try {
		const url = new URL(req.url!, `${config.website_protocol}://${req.headers.host}`)
		const path = paths[url.pathname]
		if (path) {
			if (!path.methods.includes(req.method?.toUpperCase() || "UNK")) res.writeHead(405).end()
			else if (req.headers["range"]) res.writeHead(416).end()
			else if (req.headers["expect"]) res.writeHead(417).end()
			else await path.handle(req, res, url)
		} else res.writeHead(404).end()
	} catch (e) {
		console.error(e, "webserver")
		if (res.writable) res.writeHead(500, { "Content-Type": "text/plain" }).end(String(e))
	}
}

server.listen(10430)

// wss

let sequence = 0

const TestGuild: import("discord-typings").Guild = {
	id: "0123456789876543",
	name: "Tap Test",
	icon: "afs5d4v5na6s1d4fb",
	splash: null,
	discovery_splash: null,
	owner_id: "320067006521147393",
	afk_channel_id: null,
	afk_timeout: 5000,
	verification_level: 0,
	default_message_notifications: 0,
	explicit_content_filter: 0,
	roles: [
		{
			id: "0123456789876543",
			name: "@everyone",
			color: 0,
			hoist: false,
			position: 0,
			permissions: "0",
			managed: false,
			mentionable: true,
			tags: {}
		}
	],
	emojis: [],
	mfa_level: 0,
	features: ["PARTNERED", "VERIFIED", "VIP_REGIONS", "ANIMATED_ICON", "ANIMATION_BANNER"],
	application_id: null,
	system_channel_id: "0123456789876543",
	system_channel_flags: 0,
	rules_channel_id: null,
	vanity_url_code: null,
	description: "Test guild for Tap",
	banner: null,
	premium_tier: 0,
	preferred_locale: "en-US",
	public_updates_channel_id: null,
	nsfw_level: 0,
	premium_progress_bar_enabled: false,
	voice_states: [],
	channels: [
		{
			type: 0,
			topic: "test all protocol",
			rate_limit_per_user: 0,
			last_message_id: null,
			last_pin_timestamp: null,
			id: "0123456789876543",
			guild_id: "0123456789876543",
			position: 0,
			permission_overwrites: [],
			name: "test-all-protocol",
			parent_id: null,
			nsfw: false
		}
	]
}

const TestUser: import("discord-typings").User = {
	id: "320067006521147393",
	username: "PapiOphidian",
	discriminator: "0000",
	avatar: null,
	bot: false
}

const AmandaUser: import("discord-typings").User = {
	id: "405208699313848330",
	username: "Amanda",
	discriminator: "8293",
	avatar: null,
	bot: true
}

function createFakeCommandInteraction(cmd: string, options: Array<import("discord-typings").ApplicationCommandInteractionDataOption>, isInGuild = true): import("discord-typings").Interaction {
	let resolved: import("discord-typings").ResolvedData | undefined = undefined

	for (const option of options) {
		const apply = <T extends keyof import("discord-typings").ResolvedData>(property: T, value: import("./types").UnpackRecord<import("discord-typings").ResolvedData[T]>) => {
			if (!resolved) resolved = {}
			if (!resolved[property]) resolved[property] = {}
			const target = resolved[property]!
			target[((value as { id: string }).id || (value as { user: { id: string } }).user.id)] = value
		}
		if (option.type === 6) {
			const user = (option as unknown as { value: string }).value === TestUser.id ? TestUser : AmandaUser
			apply("users", user)
			if (isInGuild) apply("members", { joined_at: new Date().toUTCString(), deaf: false, mute: false, user, nick: null, roles: [TestGuild.roles[0].id] })
		} else if (option.type === 7) apply("channels", TestGuild.channels![0])
		else if (option.type === 8) apply("roles", TestGuild.roles[0])
	}

	const interaction: import("discord-typings").Interaction = {
		id: generateSnowflake(),
		application_id: "405208699313848330",
		type: 2,
		token: crypto.randomBytes(100).toString("base64").replace(slash, "").replace(plus, "").replace(equals, ""),
		version: 1,
		guild_id: TestGuild.id,
		channel_id: TestGuild.channels![0].id,
		user: TestUser,
		data: {
			id: "4859234392127547",
			type: 1,
			name: cmd,
			options,
			resolved
		},
		member: {
			joined_at: new Date().toUTCString(),
			deaf: false,
			mute: false,
			user: TestUser,
			nick: "Papi",
			roles: [TestGuild.roles[0].id]
		},
		locale: "en-US",
		guild_locale: isInGuild ? "en-US" : undefined
	}

	interactions[`${interaction.id}_${interaction.token}`] = interaction

	return interaction
}

const sessionID = "foads876f89asfasdfa9s8d6"
const heartbeatInterval = 45000

setInterval(() => {
	for (const client of wss.clients) {
		if (client["isAlive"] === false) return client.terminate()
		client["isAlive"] = false

		if (client.readyState === ws.OPEN) client.ping(() => void 0)
	}
}, heartbeatInterval + 5000)

wss.on("connection", (socket) => {
	socket.on("message", data => onClientMessage(socket, data))
	socket["isAlive"] = true

	socket.once("close", code => onClientClose(socket, code))
	socket.once("error", () => onClientClose(socket, 1000))

	setTimeout(() => {
		socket.send(JSON.stringify({
			op: 10,
			d: {
				heartbeat_interval: heartbeatInterval
			}
		}))
	}, 1000)
})

function onClientMessage(socket: import("ws").WebSocket, data: import("ws").RawData) {
	const buf: string | Buffer = Array.isArray(data)
		? Buffer.concat(data)
		: (data instanceof ArrayBuffer)
			? Buffer.from(data)
			: data

	const d: string = buf.toString()
	let msg: import("discord-typings").GatewayPayload
	try {
		msg = JSON.parse(d)
	} catch {
		socket.close(4002)
		return
	}

	switch (msg.op) {
	case 1:
		socket["isAlive"] = true
		socket.send(JSON.stringify({ op: 11, d: msg.d, s: sequence++ }))
		break
	case 2:
		if (!msg.d || !msg.d.token || !msg.d.properties || !msg.d.intents) return socket.close(4002)
		if (msg.d.token !== config.bot_token) return socket.close(4004)
		if (socket["__test__authenticated"]) return socket.close(4005)
		socket["__test__authenticated"] = true
		socket.send(JSON.stringify({
			op: 0,
			d: {
				v: 10,
				user: {
					id: "405208699313848330",
					username: "Amanda",
					discriminator: "8293",
					avatar: null,
					bot: true
				},
				guilds: [{ id: TestGuild.id, unavailable: false }],
				session_id: sessionID,
				application: {
					id: "0123456789876543",
					name: "Amanda",
					icon: null,
					description: "A cute music bot that just wants some love",
					bot_public: true,
					bot_require_code_grant: false,
					verify_key: "idkwhattoputherelol",
					team: null
				},
				resume_gateway_url: "ws://localhost:10430/"
			} as import("discord-typings").ReadyPayload,
			s: sequence++,
			t: "READY"
		}))

		if ((msg.d.intents & (1 << 0)) === (1 << 0)) {
			socket.send(JSON.stringify({ op: 0, d: TestGuild, s: sequence++, t: "GUILD_CREATE" }))
		}

		setTimeout(() => {
			const packets = ([
				["sit", []],
				["ship", [{ type: 6, value: AmandaUser.id, name: "user2" }]],
				["bean", [{ type: 6, value: AmandaUser.id, name: "user" }]],
				["boop", [{ type: 6, value: AmandaUser.id, name: "user" }]],
				["stats", []],
				["info", []]
			] as Array<[string, Array<import("discord-typings").ApplicationCommandInteractionDataOption>]>)
				.map(([cmd, options]) => ({ op: 0, d: createFakeCommandInteraction(cmd, options), s: sequence++, t: "INTERACTION_CREATE" }))

			for (const packet of packets) {
				socket.send(JSON.stringify(packet))
			}
		}, 5000)
		break
	case 3:
		if (!socket["__test__authenticated"]) return socket.close(4003)
		break
	case 4:
		if (!socket["__test__authenticated"]) return socket.close(4003)
		break
	case 6:
		if (!socket["__test__authenticated"]) return socket.close(4003)
		break
	case 8:
		if (!socket["__test__authenticated"]) return socket.close(4003)
		break
	default:
		socket.close(4001)
		break
	}
}

function onClientClose(socket: import("ws").WebSocket, closeCode: number) {
	if (socket.readyState !== ws.CLOSING && socket.readyState !== ws.CLOSED) socket.close(closeCode)

	socket.removeAllListeners()
}
