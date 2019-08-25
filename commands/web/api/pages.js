const fs = require("fs");
const path = require("path")
const pj = path.join
const util = require("util")

/** @param {PassthroughType} passthrough */
module.exports = (passthrough) => {
	const {config, client, extra, reloadEvent, reloader, resolveTemplates, pugCache} = passthrough;

	let utils = require("../../../modules/utilities.js");
	reloader.useSync("./modules/utilities.js", utils);

	let validators = require("../../../modules/validator.js")()
	reloader.useSync("./modules/validator.js", validators)

	// Cache users to make sure they'll show up on the about page
	new utils.DMUser("176580265294954507")
	new utils.DMUser("320067006521147393")

	return [
		{
			route: "/about", methods: ["GET"], code: async () => {
				let page = pugCache.get("commands/web/pug/about.pug")({users: client.users})
				let match = page.match(/<!-- user \d+ -->/g);
				if (match) {
					let promises = [];
					for (let string of match) {
						let userID = string.match(/\d+/)[0];
						promises.push(client.users.fetch(userID));
					}
					let users = await Promise.all(promises);
					page = page.replace(/<!-- user (\d+) -->/g, (string, userID) => users.find(u => u.id == userID).tag);
				}
				return {
					statusCode: 200,
					contentType: "text/html",
					content: page
				}
			}
		},
		{
			route: "/dash", methods: ["GET"], code: async ({req}) => {
				let cookies = extra.getCookies(req)
				let session = await extra.getSession(cookies)

				if (session) {
					let user = await client.users.fetch(session.userID)
					let guilds = []
					let npguilds = []
					for (let guild of client.guilds.filter(g => g.members.has(session.userID)).values()) {
						if (guild.queue || guild.members.get(session.userID).voiceChannel) npguilds.push(guild)
						else guilds.push(guild)
					}

					let csrfToken = extra.generateCSRF()
					let page = pugCache.get("commands/web/pug/selectserver.pug")({user, npguilds, guilds, csrfToken})
					return {
						statusCode: 200,
						contentType: "text/html",
						content: page
					}
				} else {
					let csrfToken = extra.generateCSRF()
					let page = pugCache.get("commands/web/pug/login.pug")({csrfToken})
					return {
						statusCode: 200,
						contentType: "text/html",
						content: page
					}
				}
			}
		},
		{
			route: "/dash", methods: ["POST"], code: ({req, body}) => {
				return new validators.FormValidator()
				.trust({req, body, config})
				.ensureParams(["token", "csrftoken"])
				.useCSRF(extra)
				.do({
					code: (_) => utils.sql.get("SELECT * FROM WebTokens WHERE token = ?", _.params.get("token"))
					,assign: "row"
					,expected: v => v !== undefined
					,errorValue: [400, "Invalid token"]
				})
				.go()
				.then(state => {
					let token = state.params.get("token")
					let expires = new Date(Date.now() + 1000*60*60*24*365).toUTCString()
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
					let csrfToken = extra.generateCSRF()
					let page = pugCache.get("commands/web/pug/login.pug")({message: errorValue[1], csrfToken})
					return {
						statusCode: errorValue[0],
						contentType: "text/html",
						content: page
					}
				})
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
			route: "/logout", methods: ["POST"], code: ({req, body}) => {
				return new validators.FormValidator()
				.trust({req, body, config})
				.ensureParams(["csrftoken"])
				.useCSRF(extra)
				.go()
				.then(() => {
					return {
						statusCode: 303,
						contentType: "text/html",
						content: "Logging out...",
						headers: {
							"Location": "/dash",
							"Set-Cookie": `token=-; path=/; expires=${new Date(0).toUTCString()}`
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
			route: "/server/(\\d+)", methods: ["GET"], code: async ({req, fill}) => {
				let cookies = extra.getCookies(req)
				let session = await extra.getSession(cookies)

				return new validators.Validator()
				.do({
					code: () => session === undefined
					,expected: false
				}).do({
					code: (_) => _.guild = client.guilds.get(fill[0])
					,expected: v => v != undefined
				}).do({
					code: (_) => _.guild.members.has(session.userID)
					,expected: true
				})
				.go()
				.then(async state => {
					if (config.music_dash_enabled) {
						let guild = state.guild
						let user = await client.users.fetch(session.userID)

						let page = pugCache.get("commands/web/pug/server.pug")({guild, user})
						return {
							statusCode: 200,
							contentType: "text/html",
							content: page
						}
					} else {
						let page = pugCache.get("commands/web/pug/dash_disabled.pug")()
						return {
							statusCode: 200,
							contentType: "text/html",
							content: page
						}
					}
				})
				.catch(() => {
					let page = pugCache.get("commands/web/pug/accessdenied.pug")({session})
					return {
						statusCode: 403,
						contentType: "text/html",
						content: page
					}
				})
			}
		}
	]
}
