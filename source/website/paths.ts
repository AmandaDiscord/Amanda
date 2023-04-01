import pathMod = require("path")
import fs = require("fs")
import { webcrypto, createHash } from "crypto"

import { verify } from "discord-verify/node"
import marked = require("marked")

import passthrough = require("../passthrough")
const { sync, rootFolder, config } = passthrough

const util: typeof import("./util") = sync.require("./util")
const orm: typeof import("../client/utils/orm") = sync.require("../client/utils/orm")

type Path = {
	methods: Array<string>;
	static?: string;
	handle?(req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL): Promise<unknown>;
	links?: Array<string>;
}

const bodyRegex = /\$body/gm
const csrftokenRegex = /\$csrftoken/gm
const channelIDRegex = /\$channelID/gm
const timestampRegex = /\$timestamp/gm
const titleRegex = /\$title/gm
const bodyShortRegex = /\$bodyshort/gm
const modifiedRegex = /\$modified/gm
const lastfmKeyRegex = /\$lastfmkey/gm
const lastfmCallback = /\$lastfmcallback/gm
const connectionsRegex = /\$connections/gm
const dashRegex = /-/g
const fileNameRegex = /(.+?)\.\w+$/

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
		static: "index.html",
		links: ["</90s-type-beat.css>; rel=preload; as=style", "</images/amandark.webp>; rel=preload; as=image", "</images/night-background.gif>; rel=preload; as=image", "<https://fonts.google.com>; rel=preconnect"]
	},
	"/dash": {
		methods: ["GET", "HEAD", "POST"],
		links: ["</90s-type-beat.css>; rel=preload; as=style", "</images/night-background.gif>; rel=preload; as=image", "<https://fonts.google.com>; rel=preconnect"],
		async handle(req, res) {
			if (["GET", "HEAD"].includes(req.method?.toUpperCase() || "")) {
				const cookies = util.getCookies(req)
				const session = await util.getSession(cookies)

				if (session && config.db_enabled) {
					let [user, html] = await Promise.all([
						orm.db.get("voice_states", { user_id: session.user_id }),
						fs.promises.readFile(pathMod.join(rootFolder, "templates/dash.html"), { encoding: "utf8" })
					])
					const csrftoken = util.generateCSRF()
					const body = config.music_dash_enabled ? (user
						? `<a href="/channels/${user.channel_id}">View dash for channel you're active in</a>`
						: "Try joining a voice channel to see available queues") : "The dashboard is temporarily disabled. Please check back later"
					html = html.replace(bodyRegex, body).replace(csrftokenRegex, csrftoken)
					return res.writeHead(200, { "Content-Type": "text/html", "Content-Length": Buffer.byteLength(html) }).end(html)
				} else return res.writeHead(303, { "Content-Type": "text/html", "Location": "/login" }).end("Redirecting to login...")
			} else {
				if (!req.headers["content-length"] || isNaN(Number(req.headers["content-length"]))) return res.writeHead(411).end()
				if (Number(req.headers["content-length"]) > 130) return res.writeHead(413).end()
				if (req.headers["content-type"] !== "application/x-www-form-urlencoded") return res.writeHead(415).end()
				let body: Buffer
				try {
					body = await util.requestBody(req)
				} catch (e) {
					const error: Error = e
					let code = error.message.includes("BYTE_SIZE") ? 413 : 408
					return res.writeHead(code).end()
				}
				return new util.FormValidator()
					.trust({ req, body })
					.ensureParams(["token", "csrftoken"])
					.useCSRF()
					.do(
						state => config.db_enabled ? orm.db.get("web_tokens", { token: state.params.get("token")! }) : undefined,
						v => v !== undefined,
						[400, "Invalid token"]
					)
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
		links: ["</90s-type-beat.css>; rel=preload; as=style", "</images/night-background.gif>; rel=preload; as=image", "<https://fonts.google.com>; rel=preconnect"],
		async handle(req, res) {
			if (req.method?.toUpperCase() === "HEAD") return util.streamResponse(req, res, pathMod.join(rootFolder, "templates/login.html"), true)
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
				if (!req.headers["content-length"] || isNaN(Number(req.headers["content-length"]))) return res.writeHead(411).end()
				if (Number(req.headers["content-length"]) > 100) return res.writeHead(413).end()
				if (req.headers["content-type"] !== "application/x-www-form-urlencoded") return res.writeHead(415).end()
				let body: Buffer
				try {
					body = await util.requestBody(req)
				} catch (e) {
					const error: Error = e
					let code = error.message.includes("BYTE_SIZE") ? 413 : 408
					return res.writeHead(code).end()
				}
				return new util.FormValidator()
					.trust({ req, body })
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
	"/blogs": {
		methods: ["GET", "HEAD"],
		links: ["</90s-type-beat.css>; rel=preload; as=style", "</images/night-background.gif>; rel=preload; as=image", "<https://fonts.google.com>; rel=preconnect"],
		async handle(req, res) {
			let [template, blogsDir] = await Promise.all([
				fs.promises.readFile(pathMod.join(rootFolder, "./templates/blogs.html"), { encoding: "utf-8" }),
				fs.promises.readdir(pathMod.join(rootFolder, "./blogs"))
			])
			const stats = await Promise.all(blogsDir.map(blog => fs.promises.stat(pathMod.join(rootFolder, `./blogs/${blog}`)).then(i => ({ name: blog, stats: i }))))
			const htmlData = stats.sort((a, b) => b.stats.ctimeMs - a.stats.ctimeMs).map(blog => {
				const name = blog.name.match(fileNameRegex)?.[1] || "unknown regex failure"
				return `<h2 class="heading-box">Blog from ${blog.stats.ctime.getMonth() + 1}/${blog.stats.ctime.getDate()}/${blog.stats.ctime.getFullYear()}</h2><div class="section"><a href="/blog/${name}">${name.replace(dashRegex, " ").split(" ").map(s => `${s[0]?.toUpperCase()}${s.slice(1)}`).join(" ")}</a></div>`
			}).join("\n")
			template = template.replace(bodyRegex, htmlData)
			res.writeHead(200, { "Content-Type": "text/html", "Content-Length": Buffer.byteLength(template) }).end(template)
		}
	},
	"/interaction": {
		methods: ["POST"],
		async handle(req, res) {
			if (req.headers["content-type"] !== "application/json") return res.writeHead(415).end()
			if (!req.headers["x-signature-ed25519"] || !req.headers["x-signature-timestamp"]) return res.writeHead(400).end()
			if (!req.headers["content-length"] || isNaN(Number(req.headers["content-length"]))) return res.writeHead(411).end()
			const body = await util.requestBody(req, 10000)
			const bodyString = body.toString("utf-8")
			const allowed = await verify(bodyString, req.headers["x-signature-ed25519"] as string, req.headers["x-signature-timestamp"] as string, config.app_public_key, webcrypto.subtle)
			if (!allowed) return res.writeHead(401).end()
			const payload: import("discord-api-types/v10").APIInteraction = JSON.parse(bodyString)
			if (payload.type === 1) return res.writeHead(200, { "Content-Type": "application/json" }).end("{\"type\":1}")
			else if (payload.type === 2) res.writeHead(200, { "Content-Type": "application/json" }).end("{\"type\":5}") // defer because Discord doesn't accept 202 accepted
			else if (payload.type === 3) res.writeHead(200, { "Content-Type": "application/json" }).end("{\"type\":6}")

			let shard = payload.guild_id && config.db_enabled
				? await orm.db.get("guilds", { client_id: passthrough.configuredUserID, guild_id: payload.guild_id }).then(r => r ? ({ shard_id: r.shard_id, cluster_id: r.cluster_id }) : void 0)
				: void 0
			if (!shard) shard = { shard_id: payload.guild_id ? Number((BigInt(payload.guild_id) >> BigInt(22)) % BigInt(config.total_shards)) : 0, cluster_id: "unknown" }
			const toMusic = payload.type === 2 && ["play", "radio", "skip", "stop", "queue", "nowplaying", "trackinfo", "lyrics", "seek", "filters", "shuffle", "musictoken", "playlists"].includes(payload.data!.name)
			passthrough.amqpChannel?.sendToQueue(toMusic ? config.amqp_music_queue : config.amqp_queue, Buffer.from(JSON.stringify({ op: 0, t: "INTERACTION_CREATE", d: payload, s: -1, shard_id: shard.shard_id, cluster_id: shard.cluster_id })), { contentType: "application/json" })
		}
	},
	"/link": {
		methods: ["GET", "HEAD"],
		async handle(req, res) {
			const cookies = util.getCookies(req)
			const session = await util.getSession(cookies)

			if (session && config.db_enabled) {
				const [template, connections] = await Promise.all([
					fs.promises.readFile(pathMod.join(rootFolder, "./templates/link.html"), { encoding: "utf-8" }),
					orm.db.select("connections", { user_id: session.user_id }),
				])
				const csrftoken = util.generateCSRF(session.token)
				const html = template
					.replace(lastfmKeyRegex, config.lastfm_key)
					.replace(lastfmCallback, encodeURIComponent(`${config.website_protocol}://${config.website_domain}/flow?user_id=${session.user_id}&type=lastfm`))
					.replace(connectionsRegex, !connections.length ? "None" : connections.map(c => `<form action="/unlink" method="post"><input type="hidden" id="csrftoken" name="csrftoken" value="${csrftoken}"><input type="hidden" id="type" name="type" value="${c.type}"><button type="submit">Unlink ${c.type}</button></form>`).join("<br>"))
				res.writeHead(200, { "Content-Type": "text/html", "Content-Length": Buffer.byteLength(html) }).end(html)
			} else return res.writeHead(303, { "Content-Type": "text/html", "Location": "/login" }).end("Redirecting to login...")
		}
	},
	"/unlink": {
		methods: ["GET", "HEAD", "POST"],
		async handle(req, res) {
			if (["GET", "HEAD"].includes(req.method?.toUpperCase() || "")) return res.writeHead(303, { "Content-Type": "text/html", "Location": "/dash" }).end(req.method?.toUpperCase() === "HEAD" ? void 0 : "Redirecting to dash...")
			else {
				if (!req.headers["content-length"] || isNaN(Number(req.headers["content-length"]))) return res.writeHead(411).end()
				if (Number(req.headers["content-length"]) > 100) return res.writeHead(413).end()
				if (req.headers["content-type"] !== "application/x-www-form-urlencoded") return res.writeHead(415).end()
				const cookies = util.getCookies(req)
				const session = await util.getSession(cookies)
				if (!session) return res.writeHead(401).end()
				let body: Buffer
				try {
					body = await util.requestBody(req)
				} catch (e) {
					const error: Error = e
					let code = error.message.includes("BYTE_SIZE") ? 413 : 408
					return res.writeHead(code).end()
				}
				return new util.FormValidator()
					.trust({ req, body })
					.ensureParams(["type", "csrftoken"])
					.useCSRF(session.token)
					.do(
						state => config.db_enabled ? orm.db.get("connections", { user_id: session.user_id, type: state.params.get("type") as import("../types").InferModelDef<typeof orm["db"]["tables"]["connections"]>["type"] }) : undefined,
						v => v !== undefined,
						[400, "Connection not linked"]
					)
					.go()
					.then(async state => {
						await orm.db.delete("connections", { user_id: session.user_id, type: state.params.get("type") as import("../types").InferModelDef<typeof orm["db"]["tables"]["connections"]>["type"] }).catch(console.error)
						res.writeHead(200, { "Content-Type": "text/html" }).end("Logged out successfully")
					})
					.catch(errorValue => res.writeHead(errorValue[0], { "Content-Type": "text/plain" }).end(errorValue[1]))
			}
		}
	},
	"/flow": {
		methods: ["GET", "HEAD"],
		async handle(req, res, url) {
			return new util.Validator()
				.do(
					() => url.searchParams.has("user_id") && url.searchParams.has("token") && url.searchParams.has("type"),
					true,
					[400, "Missing params"]
				).do(
					() => orm.db.get("connections", { user_id: url.searchParams.get("user_id")!, type: url.searchParams.get("type")! as import("../types").InferModelDef<typeof orm["db"]["tables"]["connections"]>["type"] }).then(r => !r),
					true,
					[403, "Already connected"]
				).do(
					() => config.db_enabled,
					true,
					[500, "Database not enabled"]
				).do(
						async () => {
							const type = url.searchParams.get("type") as import("../types").InferModelDef<typeof orm["db"]["tables"]["connections"]>["type"]
							if (type === "lastfm") {
								const params = new URLSearchParams({
									method: "auth.getSession",
									token: url.searchParams.get("token")!,
									api_key: config.lastfm_key
								})
								const orderedWithSecret = `${Array.from(params.keys()).sort().map(param => `${param}${params.get(param)!}`).join("")}${config.lastfm_secret}`
								const signature = createHash("md5").update(orderedWithSecret).digest("hex")
								const session = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}&api_sig=${signature}&format=json`).then(d => d.json())
								return session.session.key as string
							} else throw new Error("INVALID_TYPE")
						},
						i => !!i,
						[400, "Invalid token"],
						"access"
					)
				.go()
				.then(async state => {
					await orm.db.insert("connections", { user_id: url.searchParams.get("user_id")!, access: state.access, type: url.searchParams.get("type")! as import("../types").InferModelDef<typeof orm["db"]["tables"]["connections"]>["type"] }).catch(console.error)
					redirect(res, "/link")
				})
				.catch(errorValue => res.writeHead(errorValue[0], { "Content-Type": "text/plain" }).end(errorValue[1]))
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
		links?: Array<string>;
		router: (req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL, params: { [param: string]: string }) => Promise<unknown>;
	}
} = {
	"/channels/:channelID": {
		methods: ["GET"],
		links: ["</90s-type-beat.css>; rel=preload; as=style", "<https://fonts.google.com>; rel=preconnect"],
		async router(req, res, _url, { channelID }) {
			const cookies = util.getCookies(req)
			const session = await util.getSession(cookies)

			return new util.Validator()
			.do(
				() => config.music_dash_enabled,
				true,
				"Dashboard temporarily disabled. Please check back later"
			)
			.do(
				() => session === null,
				false,
				"NO_SESSION"
			).do(
				() => config.db_enabled ? orm.db.get("voice_states", { user_id: session!.user_id, channel_id: channelID }) : undefined,
				v => !!v,
				"USER_NOT_IN_CHANNEL"
			)
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
	},
	"/blog/:blogID": {
		methods: ["GET", "HEAD"],
		links: ["</90s-type-beat.css>; rel=preload; as=style", "</images/night-background.gif>; rel=preload; as=image", "<https://fonts.google.com>; rel=preconnect"],
		async router(req, res, url, { blogID }) {
			const title = blogID.split("-").map(i => `${i[0]?.toUpperCase()}${i.slice(1)}`).join(" ");
			const toMD = pathMod.join(rootFolder, `./blogs/${blogID}.md`)
			const stat = await fs.promises.stat(toMD).catch(() => void 0)
			if (!stat) return util.streamResponse(req, res, pathMod.join(rootFolder, "./404.html"), req.method?.toUpperCase() === "HEAD", 404)
			const [template, data] = await Promise.all([
				fs.promises.readFile(pathMod.join(rootFolder, "./templates/blog.html"), { encoding: "utf-8" }),
				fs.promises.readFile(toMD, { encoding: "utf-8" })
			])
			const rendered = marked.marked(data)
			const sliced = data.slice(0, 60)
			const short = data.length > 60 ? `${sliced}...` : sliced
			const html = template
				.replace(titleRegex, title)
				.replace(timestampRegex, stat.ctime.toISOString())
				.replace(modifiedRegex, stat.mtime.toISOString())
				.replace(bodyShortRegex, short)
				.replace(bodyRegex, rendered)
			return res.writeHead(200, { "Content-Type": "text/html", "Content-Length": Buffer.byteLength(html) }).end(html)
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
			links: routes[pt.route].links,
			handle: (req, res, url) => routes[pt.route].router(req, res, url, params)
		} as Path
	}
})

export = { paths: prox }
