// @ts-check

const types = require("../../typings")

const passthrough = require("../passthrough")
const { config, ipc } = passthrough

const {render} = require("pinski/plugins")

const utils = require("../modules/utilities.js")
// reloader.useSync("./modules/utilities.js", utils)

const validators = require("../modules/validator.js")()
// reloader.useSync("./modules/validator.js", validators)

const aboutCache = { devs: [], donors: [], translators: [], lastCache: 0 }
const aboutCacheExpires = 1000 * 60 * 60

module.exports = [
	{
		route: "/about", methods: ["GET"], code: async () => {
			if (aboutCache.lastCache <= Date.now() - aboutCacheExpires) {
				const data = await utils.sql.all("SELECT users.tag, users.avatar, users.id, member_roles.role_id FROM users INNER JOIN member_roles ON users.id = member_roles.id WHERE member_roles.role_id = $1 OR member_roles.role_id = $2 OR member_roles.role_id = $3", ["475599471049310208", "475599593879371796", "755604509664739439"]).then(rows => rows.map(r => {
					return { id: r.id, role_id: r.role_id, user: { id: r.id, tag: r.tag, avatar: r.avatar } }
				}))
				aboutCache.devs = data.filter(r => r.role_id === "475599471049310208")
				aboutCache.donors = data.filter(r => r.role_id === "475599593879371796")
				aboutCache.translators = data.filter(r => r.role_id === "755604509664739439")
				aboutCache.lastCache = Date.now()
			}
			return render(200, "pug/about.pug", { devs: aboutCache.devs, donors: aboutCache.donors, translators: aboutCache.translators })
		}
	},
	{
		route: "/dream", methods: ["GET"], code: async () => {
			return render(200, "pug/dream.pug")
		}
	},
	{
		route: "/donate", methods: ["GET"], code: async () => {
			return render(200, "pug/donate.pug")
		}
	},
	{
		route: "/dash", methods: ["GET"], code: async ({ req }) => {
			const cookies = utils.getCookies(req)
			const session = await utils.getSession(cookies)

			if (session) {
				const user = await utils.sql.get("SELECT * FROM users WHERE id = $1", session.user_id)
				return ipc.replier.requestGetDashGuilds(session.user_id, true).then(({guilds, npguilds}) => {
					const displayNoSharedServers = guilds.length === 0 && npguilds.length === 0
					const csrfToken = utils.generateCSRF()
					return render(200, "pug/selectserver.pug", { user, npguilds, displayNoSharedServers, guilds, csrfToken })
				}).catch(() => {
					return render(500, "pug/error.pug", { message: "No clients connected for selectserver." })
				})
			} else {
				const csrfToken = utils.generateCSRF()
				return render(200, "pug/login.pug", { csrfToken })
			}
		}
	},
	{
		route: "/dash", methods: ["POST"], upload: true, code: ({ req, body }) => {
			return new validators.FormValidator()
			.trust({ req, body, config })
			.ensureParams(["token", "csrftoken"])
			.useCSRF(utils)
			.do({
				code: (_) => utils.sql.get("SELECT * FROM web_tokens WHERE token = $1", _.params.get("token"))
				, assign: "row"
				, expected: v => v !== undefined
				, errorValue: [400, "Invalid token"]
			})
			.go()
			.then(state => {
				const token = state.params.get("token")
				const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toUTCString()
				return {
					statusCode: 303,
					contentType: "text/html",
					content: "Logging in...",
					headers: {
						"Location": "/dash",
						"Set-Cookie": `token=${token}; path=/; expires=${expires}`
					}
				}
			})
			.catch(errorValue => {
				const csrfToken = utils.generateCSRF()
				return render(errorValue[0], "pug/login.pug", { message: errorValue[1], csrfToken })
			})
		}
	},
	{
		route: "/admin/config", methods: ["GET"], code: async ({req}) => {
			const cookies = utils.getCookies(req)
			const session = await utils.getSession(cookies)

			let allowed = false
			if (session && session.user_id) {
				const row = await utils.sql.get("SELECT * FROM user_permissions WHERE user_id = $1", session.user_id)
				if (row && row.eval) allowed = true
			}

			if (allowed) {
				const clusterData = await ipc.replier.requestUpdateConfig()
				return render(200, "pug/config.pug", { clusterData })
			} else {
				const csrfToken = utils.generateCSRF()
				return render(401, "pug/login.pug", { message: "You must log in.", csrfToken })
			}
		}
	},
	{
		route: "/formapi/updateconfig", methods: ["POST"], upload: true, code: async ({req, body}) => {
			const cookies = utils.getCookies(req)
			const session = await utils.getSession(cookies)

			let allowed = false
			if (session && session.user_id) {
				const row = await utils.sql.get("SELECT * FROM user_permissions WHERE user_id = $1", session.user_id)
				if (row && row.eval) allowed = true
			}

			if (allowed) {
				return new validators.FormValidator()
				.trust({ req, body, config })
				.go()
				.then(async state => {
					/** @type {URLSearchParams} */
					const params = state.params
					const cfg = {
						allow_ai: params.has("allow-ai")
					}
					const lavalinkNodes =
						Array(+params.get("number-of-nodes"))
							.fill(undefined)
							.map((_, i) => ({
								enabled: params.has(`enable-node-${i}`),
								search_with_invidious: params.has(`enable-node-${i}-invidious`)
							}))

					console.log({config: cfg, lavalinkNodes})

					await ipc.replier.requestUpdateConfig({config: cfg, lavalinkNodes})

					return {
						statusCode: 303,
						contentType: "text/html",
						headers: {
							"Location": "/admin/config"
						},
						content: "Redirecting..."
					}
				})
			} else {
				return [401, "Unauthorised"]
			}
		}
	},
	{
		route: "/logout", methods: ["GET"], code: () => {
			return {
				statusCode: 303,
				contentType: "text/html",
				content: "Redirecting...",
				headers: {
					"Location": "/dash"
				}
			}
		}
	},
	{
		route: "/logout", methods: ["POST"], upload: true, code: ({ req, body }) => {
			return new validators.FormValidator()
			.trust({ req, body, config })
			.ensureParams(["csrftoken"])
			.useCSRF(utils)
			.go()
			.then(() => {
				return {
					statusCode: 303,
					contentType: "text/html",
					content: "Logging out...",
					headers: {
						"Location": "/dash",
						"Set-Cookie": `token=; path=/; expires=${new Date(0).toUTCString()}`
					}
				}
			})
			.catch(errorValue => {
				return {
					statusCode: errorValue[0],
					contentType: "text/plain",
					content: errorValue[1]
				}
			})
		}
	},
	{
		route: "/server/(\\d+)", methods: ["GET"], code: async ({ req, fill }) => {
			const cookies = utils.getCookies(req)
			const session = await utils.getSession(cookies)

			const guildID = fill[0]

			return new validators.Validator()
			.do({
				code: () => session == null
				, expected: false
				, errorValue: "NO_SESSION"
			}).do({
				code: () => ipc.replier.getShardIDForGuild(guildID)
				, expected: v => v != null
				, errorValue: "Cluster not available for server view."
			}).do({
				code: () => ipc.replier.requestGetGuildForUser(session.user_id, guildID)
				, assign: "guild"
				, expected: v => v != null
				, errorValue: "USER_NOT_IN_GUILD"
			})
			.go()
			.then(state => {
				if (config.music_dash_enabled) {
				/** @type {types.FilteredGuild} */
					const guild = state.guild
					return render(200, "pug/server.pug", { guild, timestamp: Date.now() })
				} else {
					return render(200, "pug/dash_disabled.pug")
				}
			})
			.catch(err => {
				if (err === "USER_NOT_IN_GUILD" || err === "NO_SESSION") {
					return render(403, "pug/accessdenied.pug", { session })
				} else {
					return render(500, "pug/error.pug", { message: err })
				}
			})
		}
	}
]
