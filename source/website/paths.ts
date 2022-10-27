import p from "path"
import fs from "fs"

import passthrough from "../passthrough"
const { sync, rootFolder, config } = passthrough

const util: typeof import("./util") = sync.require("./util")
const orm: typeof import("../utils/orm") = sync.require("../utils/orm")

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
	add: "https://discord.com/api/oauth2/authorize?client_id=405208699313848330&permissions=36700160&scope=bot%20applications.commands",
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
	"/about": {
		methods: ["GET", "HEAD"],
		static: "about.html"
	},
	"/dash": {
		methods: ["GET", "HEAD", "POST"],
		async handle(req, res) {
			if (["GET", "HEAD"].includes(req.method?.toUpperCase() || "")) {
				const cookies = util.getCookies(req)
				const session = await util.getSession(cookies)

				if (session && config.db_enabled) {
					const user = await orm.db.get("voice_states", { user_id: session.user_id })
					let html = await fs.promises.readFile(p.join(rootFolder, "templates/dash.html"), { encoding: "utf8" })
					const csrftoken = util.generateCSRF()
					const body = user
						? `<a href="/channels/${user.channel_id}">View dash for channel you're active in</a>`
						: "Try joining a voice channel to see available queues"
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
			if (req.method?.toUpperCase() === "HEAD") return util.streamResponse(res, p.join(rootFolder, "templates/login.html"), true)
			let html = await fs.promises.readFile(p.join(rootFolder, "templates/login.html"), { encoding: "utf8" })
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
	}
}

async function redirect(res: import("http").ServerResponse, location: string) {
	res.writeHead(302, { Location: location, "Content-Type": "text/html" }).end(`Redirecting to <a href="${location}">${location}</a>...`)
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
		router: (req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL, ...params: Array<string>) => Promise<unknown>;
	}
} = {
	"/channels/(\\d+)": {
		methods: ["GET"],
		async router(req, res, _url, channelID) {
			const cookies = util.getCookies(req)
			const session = await util.getSession(cookies)

			return new util.Validator()
			.do({
				code: () => session == null
				, expected: false
				, errorValue: "NO_SESSION"
			}).do({
				code: () => config.db_enabled ? orm.db.get("voice_states", { user_id: session!.user_id, channel_id: channelID }) : undefined
				, expected: v => v != null
				, errorValue: "USER_NOT_IN_CHANNEL"
			})
			.go()
			.then(async () => {
				let html = await fs.promises.readFile(p.join(rootFolder, "templates/channel.html"), { encoding: "utf8" })
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
		},
	}
}

const compiledRegexes = {} as { [route: string]: RegExp }

for (const key of Object.keys(routes)) {
	compiledRegexes[key] = new RegExp(key)
}

const routeKeyRegex = /\/(\d+)(\/)?/g

const prox = new Proxy(paths, {
	get(target, property, receiver) {
		const existing = Reflect.get(target, property, receiver)
		if (existing) return existing
		const prop = property.toString()
		const routeKey = prop.replace(routeKeyRegex, "/(\\d+)$2")
		if (routes[routeKey]) {
			const match = prop.match(compiledRegexes[routeKey])
			if (!match) throw new Error("PANIC_COMPILED_REGEX_NO_MATCHES")
			const params = match.slice(1)
			return {
				methods: routes[routeKey].methods,
				handle: (req, res, url) => routes[routeKey].router(req, res, url, ...params)
			} as Path
		} else return void 0
	}
})

export = prox
