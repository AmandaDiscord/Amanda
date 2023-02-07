import pathMod from "path"
import fs from "fs"
import { webcrypto } from "crypto"

import { verify } from "discord-verify/node"

import passthrough from "../passthrough"
const { sync, rootFolder, config, amqpChannel, configuredUserID } = passthrough

const util: typeof import("./util") = sync.require("./util")
const orm: typeof import("../client/utils/orm") = sync.require("../client/utils/orm")

type Path = {
	methods: Array<string>;
	static?: string;
	handle?(req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL): Promise<unknown>;
}

const bodyRegex = /\$body/gm
const csrftokenRegex = /\$csrftoken/gm
const channelIDRegex = /\$channelID/gm
const timestampRegex = /\$timestamp/gm

const redirects = {
	stats: "https://cheweyz.github.io/discord-bot-analytics-dash/index.html?id=320067006521147393",
	patreon: "https://www.patreon.com/papiophidian",
	paypal: "https://paypal.me/papiophidian",
	server: "https://discord.gg/zhthQjH",
	add: config.add_url,
	todo: "https://github.com/AmandaDiscord/Amanda/projects",
	twitter: "https://twitter.com/AmandaDiscord",
	github: "https://github.com/AmandaDiscord",
	privacy: "https://github.com/AmandaDiscord/Amanda/blob/rewrite/PRIVACYPOLICY",
	tos: "https://github.com/AmandaDiscord/Amanda/blob/rewrite/TERMSOFSERVICE",
	tsukiko: "https://discord.com/api/oauth2/authorize?client_id=709907646387322932&permissions=268510208&scope=bot%20applications.commands"
}

const paths: {
	[path: string]: Path
} = {
	"/": {
		methods: ["GET", "HEAD"],
		static: "index.html"
	},
	"/dash": {
		methods: ["GET", "HEAD", "POST"],
		async handle(req, res) {
			if (["GET", "HEAD"].includes(req.method?.toUpperCase() || "")) {
				const cookies = util.getCookies(req)
				const session = await util.getSession(cookies)

				if (session && config.db_enabled) {
					const user = await orm.db.get("voice_states", { user_id: session.user_id })
					let html = await fs.promises.readFile(pathMod.join(rootFolder, "templates/dash.html"), { encoding: "utf8" })
					const csrftoken = util.generateCSRF()
					const body = config.music_dash_enabled ? (user
						? `<a href="/channels/${user.channel_id}">View dash for channel you're active in</a>`
						: "Try joining a voice channel to see available queues") : "The dashboard is temporarily disabled. Please check back later"
					html = html.replace(bodyRegex, body).replace(csrftokenRegex, csrftoken)
					return res.writeHead(200, { "Content-Type": "text/html", "Content-Length": Buffer.byteLength(html) }).end(html)
				} else return res.writeHead(303, { "Content-Type": "text/html", "Location": "/login" }).end("Redirecting to login...")
			} else {
				if (!req.headers["content-length"]) return res.writeHead(411).end()
				let body: Buffer
				try {
					body = await util.requestBody(req)
				} catch (e) {
					const error: Error = e
					let code = error.message.includes("BYTE_SIZE") ? 413 : 408
					return res.writeHead(code).end()
				}
				return new util.FormValidator()
					.trust({ req, body, config })
					.ensureParams(["token", "csrftoken"])
					.useCSRF()
					.do({
						code: (state) => config.db_enabled ? orm.db.get("web_tokens", { token: state.params.get("token") }) : undefined
						, assign: "row"
						, expected: v => v !== undefined
						, errorValue: [400, "Invalid token"]
					})
					.go()
					.then(state => {
						const token = state.params.get("token")
						const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toUTCString()
						res.writeHead(303, {
							"Content-Type": "text/html",
							"Location": "/dash",
							"Set-Cookie": `token=${token}; path=/; expires=${expires}`
						}).end("Logging in...")
					})
					.catch(errorValue => res.writeHead(errorValue[0], { "Content-Type": "text/plain" }).end(errorValue[1]))
			}
		}
	},
	"/login": {
		methods: ["GET", "HEAD"],
		async handle(req, res) {
			if (req.method?.toUpperCase() === "HEAD") return util.streamResponse(res, pathMod.join(rootFolder, "templates/login.html"), true)
			let html = await fs.promises.readFile(pathMod.join(rootFolder, "templates/login.html"), { encoding: "utf8" })
			const csrftoken = util.generateCSRF()
			html = html.replace(csrftokenRegex, csrftoken)
			return res.writeHead(200, { "Content-Type": "text/html", "Content-Length": Buffer.byteLength(html) }).end(html)
		}
	},
	"/logout": {
		methods: ["GET", "HEAD", "POST"],
		async handle(req, res) {
			if (["GET", "HEAD"].includes(req.method?.toUpperCase() || "")) return res.writeHead(303, { "Content-Type": "text/html", "Location": "/dash" }).end(req.method?.toUpperCase() === "HEAD" ? void 0 : "Redirecting to dash...")
			else {
				if (!req.headers["content-length"]) return res.writeHead(411).end()
				let body: Buffer
				try {
					body = await util.requestBody(req)
				} catch (e) {
					const error: Error = e
					let code = error.message.includes("BYTE_SIZE") ? 413 : 408
					return res.writeHead(code).end()
				}
				return new util.FormValidator()
					.trust({ req, body, config })
					.ensureParams(["csrftoken"])
					.useCSRF()
					.go()
					.then(() => {
						res.writeHead(303, {
							"Content-Type": "text/html",
							"Location": "/login",
							"Set-Cookie": `token=; path=/; expires=${new Date(0).toUTCString()}`
						}).end("Logging out...")
					})
					.catch(errorValue => res.writeHead(errorValue[0], { "Content-Type": "text/plain" }).end(errorValue[1]))
			}
		}
	},
	"/interaction": {
		methods: ["POST"],
		async handle(req, res) {
			if (req.headers["content-type"] !== "application/json" || !req.headers["x-signature-ed25519"] || !req.headers["x-signature-timestamp"]) return res.writeHead(400).end()
			const body = await util.requestBody(req, 10000)
			const bodyString = body.toString("utf-8")
			const allowed = await verify(bodyString, req.headers["x-signature-ed25519"] as string, req.headers["x-signature-timestamp"] as string, config.app_public_key, webcrypto.subtle)
			if (!allowed) return res.writeHead(401).end()
			const payload: import("discord-api-types/v10").APIInteraction = JSON.parse(bodyString)
			if (payload.type === 1) return res.writeHead(200, { "Content-Type": "application/json" }).end("{\"type\":1}")
			else if (payload.type === 2) res.writeHead(200, { "Content-Type": "application/json" }).end("{\"type\":5}") // defer because Discord doesn't accept 202 accepted
			else if (payload.type === 3) res.writeHead(200, { "Content-Type": "application/json" }).end("{\"type\":6}")

			const shard = payload.guild_id && config.db_enabled ? await orm.db.get("guilds", { client_id: configuredUserID, guild_id: payload.guild_id }) : { shard_id: -1, cluster_id: "unknown" }
			const toMusic = payload.type === 2 && ["play", "radio", "skip", "stop", "queue", "nowplaying", "trackinfo", "lyrics", "seek", "filters", "shuffle", "musictoken", "playlists"].includes(payload.data!.name)
			amqpChannel.sendToQueue(toMusic ? config.amqp_music_queue : config.amqp_queue, Buffer.from(JSON.stringify({ op: 0, t: "INTERACTION_CREATE", d: payload, s: -1, shard_id: shard.shard_id, cluster_id: shard.cluster_id })), { contentType: "application/json" })
		}
	}
}

async function redirect(res: import("http").ServerResponse, location: string) {
	res.writeHead(302, { Location: location, "Content-Type": "text/html" }).end(`Redirecting to <a href="${location}">${location}</a>...`)
}

paths["/about"] = {
	methods: ["GET"],
	handle: (_req, res) => redirect(res, "/")
}

for (const [key, value] of Object.entries(redirects)) {
	paths[`/to/${key}`] = {
		methods: ["GET"],
		handle: (_req, res) => redirect(res, value)
	}
}

const routes: {
	[route: string]: {
		methods: Array<string>;
		router: (req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL, params: { [param: string]: string }) => Promise<unknown>;
	}
} = {
	"/channels/:channelID": {
		methods: ["GET"],
		async router(req, res, _url, { channelID }) {
			const cookies = util.getCookies(req)
			const session = await util.getSession(cookies)

			return new util.Validator()
			.do({
				code: () => config.music_dash_enabled
				, expected: true
				, errorValue: "Dashboard temporarily disabled. Please check back later"
			})
			.do({
				code: () => session === null
				, expected: false
				, errorValue: "NO_SESSION"
			}).do({
				code: () => config.db_enabled ? orm.db.get("voice_states", { user_id: session!.user_id, channel_id: channelID }) : undefined
				, expected: v => v != null
				, errorValue: "USER_NOT_IN_CHANNEL"
			})
			.go()
			.then(async () => {
				let html = await fs.promises.readFile(pathMod.join(rootFolder, "templates/channel.html"), { encoding: "utf8" })
				html = html
					.replace(bodyRegex, config.music_dash_enabled ? `Dash for ${channelID}` : "The dashboard is temporarily disabled. Please check back later")
					.replace(channelIDRegex, channelID)
					.replace(timestampRegex, Date.now().toString())
				return res.writeHead(200, { "Content-Type": "text/html", "Content-Length": Buffer.byteLength(html) }).end(html)
			})
			.catch(err => {
				res.writeHead(303, {
					"Content-Type": "text/html",
					"Location": "/dash"
				}).end(err)
			})
		}
	}
}

type Folder = {
	route?: string;
}

const folders: Folder = {}

function getRouteFromFolders(steps: Array<string>): { route: string } | null {
	let current = folders
	for (let i = 0; i < steps.length; i++) {
		if (!current) return null
		else if (current[steps[i]]) current = current[steps[i]]
		else {
			const traversible = Object.keys(current).find(item => item[0] === ":" && (!!current[item].route || current[item][steps[i + 1]])) // routes cannot have a dynamic key directly after one.
			if (traversible) current = current[traversible]
			else return null
		}
	}
	if (!current.route) return null
	return { route: current.route }
}

const slash = /\//g

for (const key of Object.keys(routes)) {
	const split = key.split(slash).slice(1)
	let previous = folders
	for (let i = 0; i < split.length; i++) {
		const path = split[i]
		if (!previous[path]) previous[path] = {}
		if (i === split.length - 1) {
			previous[path].route = key
		}
		previous = previous[path]
	}
}

const prox = new Proxy(paths, {
	get(target, property, receiver) {
		const existing = Reflect.get(target, property, receiver)
		if (existing) return existing
		const prop = property.toString()
		const split = prop.split(slash).slice(1)
		const pt = getRouteFromFolders(split)
		if (!pt || !pt.route) return void 0

		const params = {}
		const routeFolders = pt.route.split(slash).slice(1)
		for (let i = 0; i < split.length; i++) {
			if (routeFolders[i][0] === ":") params[routeFolders[i].slice(1)] = split[i]
		}

		return {
			methods: routes[pt.route].methods,
			handle: (req, res, url) => routes[pt.route].router(req, res, url, params)
		} as Path
	}
})

export = prox
