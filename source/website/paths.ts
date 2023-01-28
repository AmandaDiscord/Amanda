import pathMod from "path"
import fs from "fs"
import { webcrypto } from "crypto"
import { BetterComponent } from "callback-components"

import { verify } from "discord-verify/node"

import Command from "../client/modules/Command"

import passthrough, { configuredUserID } from "../passthrough"
const { sync, rootFolder, config, amqpChannel, queues, lavalink, commands, snow, constants } = passthrough

const util: typeof import("./util") = sync.require("./util")
const orm: typeof import("../client/utils/orm") = sync.require("../client/utils/orm")
const text: typeof import("../client/utils/string") = sync.require("../client/utils/string")
const lang: typeof import("../client/utils/language") = sync.require("../client/utils/language")
const music: typeof import("./music/sessions") = sync.require("./music/sessions")

type Path = {
	methods: Array<string>;
	static?: string;
	handle?(req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL): Promise<unknown>;
}

const bodyRegex = /\$body/gm
const csrftokenRegex = /\$csrftoken/gm
const channelIDRegex = /\$channelID/gm
const timestampRegex = /\$timestamp/gm
const backtickRegex = /`/g

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
			const payload: import("discord-typings").Interaction = JSON.parse(bodyString)
			if (payload.type === 1) return res.writeHead(200, { "Content-Type": "application/json" }).end("{\"type\":1}")
			else if (payload.type === 2) res.writeHead(200, { "Content-Type": "application/json" }).end("{\"type\":5}") // defer because Discord doesn't accept 202 accepted
			else if (payload.type === 3) res.writeHead(200, { "Content-Type": "application/json" }).end("{\"type\":6}")

			const shard = payload.guild_id ? await orm.db.get("guilds", { client_id: configuredUserID, guild_id: payload.guild_id }) : { shard_id: 0, cluster_id: "unknown" }
			if (payload.type === 2 && ["play", "radio", "skip", "stop", "queue", "nowplaying", "trackinfo", "lyrics", "seek", "filters", "shuffle", "musictoken", "playlists"].includes(payload.data!.name)) {
				const interaction = payload
				const selfLang = lang.getLang(interaction.locale!)

				const user = interaction.user ? interaction.user : interaction.member!.user
				if (config.db_enabled) orm.db.upsert("users", { id: user.id, tag: `${user.username}#${user.discriminator}`, avatar: user.avatar, bot: user.bot ? 1 : 0, added_by: config.cluster_id })
				if (interaction.guild_id && !config.db_enabled) return snow.interaction.editOriginalInteractionResponse(interaction.application_id, interaction.token, { content: selfLang.GLOBAL.DATABASE_OFFLINE })
				try {
					const cmd = new Command(interaction)
					await commands.cache.get(interaction.data!.name)?.process(cmd, selfLang, shard)
				} catch (e) {
					if (e && e.code) {
						if (e.code == 10008) return
						if (e.code == 50013) return
					}

					const embed: import("discord-typings").Embed = {
						description: lang.replace(selfLang.GLOBAL.COMMAND_ERROR, { "name": interaction.data!.name, "server": constants.server }),
						color: 0xdd2d2d
					}

					// Report to original channel
					snow.interaction.createFollowupMessage(interaction.application_id, interaction.token, { embeds: [embed] }).catch(() => console.error("Error with sending alert that command failed. Probably a 403 resp code"))

					// Report to #amanda-error-log
					embed.title = "Command error occured."
					embed.description = await text.stringify(e)
					const details = [
						["Tree", config.cluster_id],
						["Branch", String(shard.shard_id)],
						["User", `${user.username}#${user.discriminator}`],
						["User ID", user.id],
						["Bot", user.bot ? "Yes" : "No"],
						["DM", interaction.guild_id ? "No" : "Yes"]
					]
					if (interaction.guild_id) {
						details.push(...[
							["Guild ID", interaction.guild_id],
							["Channel ID", interaction.channel_id || "NONE"]
						])
					}
					const maxLength = details.reduce((page, c) => Math.max(page, c[0].length), 0)
					const detailsString = details.map(row =>
						`\`${row[0]}${" ​".repeat(maxLength - row[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
					).join("\n")
					type notSub = Exclude<import("discord-typings").ApplicationCommandInteractionDataOption, import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeSub | import("discord-typings").ApplicationCommandInteractionDataOptionNotTypeNarrowed>
					const properties = [
						interaction.data!.name,
						interaction.data!.options?.map((o) => `${o.name}:${(o as notSub).value}`)
					]
					embed.fields = [
						{ name: "Details", value: detailsString },
						{ name: "Message content", value: `\`\`\`\n/${properties.filter(Boolean).join(" ").replace(backtickRegex, "ˋ")}\`\`\`` }
					]

					snow.channel.createMessage("512869106089852949", { embeds: [embed] })
				}
			} else if (payload.type === 3) BetterComponent.handle(payload)
			amqpChannel.sendToQueue(config.amqp_queue, Buffer.from(JSON.stringify({ op: 0, t: "INTERACTION_CREATE", d: payload, s: -1, shard_id: shard.shard_id, cluster_id: shard.cluster_id })), { contentType: "application/json" })
		}
	},
	"/voice-state-update": {
		methods: ["POST"],
		async handle(req, res) {
			const allowed = req.headers.authorization === config.bot_token
			if (!allowed) return res.writeHead(401).end()
			const body = await util.requestBody(req)
			const payload: import("discord-typings").VoiceState = JSON.parse(body.toString("utf-8"))

			if (payload.channel_id === null && config.db_enabled) orm.db.delete("voice_states", { user_id: payload.user_id, guild_id: payload.guild_id })
			else if (config.db_enabled) orm.db.upsert("voice_states", { guild_id: payload.guild_id, user_id: payload.user_id, channel_id: payload.channel_id || undefined }, { useBuffer: false })
			lavalink.voiceStateUpdate(payload as import("lavacord").VoiceStateUpdate)
			queues.get(payload.guild_id!)?.voiceStateUpdate(payload as import("lavacord").VoiceStateUpdate)
			res.writeHead(201).end()
		}
	},
	"/voice-server-update": {
		methods: ["POST"],
		async handle(req, res) {
			const allowed = req.headers.authorization === config.bot_token
			if (!allowed) return res.writeHead(401).end()
			const body = await util.requestBody(req)
			const payload: import("discord-typings").VoiceServerUpdatePacket = JSON.parse(body.toString("utf-8"))
			lavalink.voiceServerUpdate(payload as import("lavacord").VoiceServerUpdate)
			res.writeHead(201).end()
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
				code: () => session == null
				, expected: false
				, errorValue: "NO_SESSION"
			}).do({
				code: () => config.db_enabled ? orm.db.get("voice_states", { user_id: session!.user_id, guild_id: channelID }) : undefined
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
