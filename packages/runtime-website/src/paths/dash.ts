import fs = require("fs")
import path = require("path")

import sql = require("@amanda/sql")
import redis = require("@amanda/redis")

import passthrough = require("../passthrough");
import type { GatewayVoiceState } from "discord-api-types/v10"
const { server, sync, rootFolder, confprovider } = passthrough

const utils: typeof import("../utils") = sync.require("../utils")

const bodyRegex = /\$body/gm
const csrftokenRegex = /\$csrftoken/gm
const channelIDRegex = /\$channelID/gm
const timestampRegex = /\$timestamp/gm

server.get("/login", async (res) => {
	utils.attachResponseAbortListener(res)

	let html = await fs.promises.readFile(path.join(rootFolder, "templates/login.html"), { encoding: "utf8" })

	if (!res.continue) return

	const csrftoken = utils.generateCSRF()
	html = html.replace(csrftokenRegex, csrftoken)
	res.cork(() => {
		res
			.writeStatus("200")
			.writeHeader("Content-Type", "text/html")
			.writeHeader("Content-Length", String(Buffer.byteLength(html)))
			.end(html)
	})
})

server.post("/logout", async (res, req) => {
	const reqLength = req.getHeader("content-length")
	const reqType = req.getHeader("content-type")
	const reqOrigin = req.getHeader("origin")
	const reqReferrer = req.getHeader("referrer")
	const reqHost = req.getHeader("host")

	if (!reqLength || isNaN(Number(reqLength))) return void res.writeStatus("411").endWithoutBody()
	if (Number(reqLength) > 100) return void res.writeStatus("413").endWithoutBody()
	if (reqType !== "application/x-www-form-urlencoded") return void res.writeStatus("415").endWithoutBody()

	utils.attachResponseAbortListener(res)

	let body: Buffer | undefined
	try {
		body = await utils.requestBody(res, Number(reqLength))
	} catch {
		if (!res.continue) return
		return void res.cork(() => res.writeStatus("408").endWithoutBody())
	}

	if (!res.continue) return

	new utils.FormValidator()
		.trust({ origin: reqOrigin, referrer: reqReferrer, host: reqHost, body, contentType: reqType })
		.ensureParams(["csrftoken"])
		.useCSRF()
		.go()
		.then(() => {
			if (!res.continue) return

			res.cork(() => res.writeHeader("Set-Cookie", `token=; path=/; expires=${new Date(0).toUTCString()}`))
			utils.redirect(res, "/login")
		})
		.catch(errorValue => {
			if (!res.continue) return
			res.cork(() => {
				res
					.writeStatus(String(errorValue[0]))
					.writeHeader("Content-Type", "text/plain")
					.writeHeader("Content-Length", String(Buffer.byteLength(errorValue[1])))
					.end(errorValue[1])
			})
		})
})

server.get("/dash", async (res, req) => {
	utils.attachResponseAbortListener(res)

	const cookieHeader = req.getHeader("cookie")

	const cookies = utils.getCookies(cookieHeader)
	const session = await utils.getSession(cookies)

	if (!res.continue) return

	if (session && confprovider.config.db_enabled) {
		const [user, html] = await Promise.all([
			redis.GET<GatewayVoiceState>("voice", session.user_id),
			fs.promises.readFile(path.join(rootFolder, "templates/dash.html"), { encoding: "utf8" })
		])

		if (!res.continue) return

		const csrftoken = utils.generateCSRF()

		const body = confprovider.config.dash_enabled
			? (user
				? `<a href="/channels/${user.channel_id}">View dash for channel you're active in</a>`
				: "Try joining a voice channel to see available queues")
			: "The dashboard is temporarily disabled. Please check back later"

		const html2 = html.replace(bodyRegex, body).replace(csrftokenRegex, csrftoken)
		res.cork(() => {
			res
				.writeStatus("200")
				.writeHeader("Content-Type", "text/html")
				.writeHeader("Content-Length", String(Buffer.byteLength(html2)))
				.end(html2)
		})
	} else utils.redirect(res, "/login")
})

server.post("/dash", async (res, req) => {
	const reqLength = req.getHeader("content-length")
	const reqType = req.getHeader("content-type")
	const reqOrigin = req.getHeader("origin")
	const reqReferrer = req.getHeader("referrer")
	const reqHost = req.getHeader("host")

	if (!reqLength || isNaN(Number(reqLength))) return void res.cork(() => res.writeStatus("411").endWithoutBody())
	if (Number(reqLength) > 130) return void res.cork(() => res.writeStatus("413").endWithoutBody())
	if (reqType !== "application/x-www-form-urlencoded") return void res.cork(() => res.writeStatus("415").endWithoutBody())

	utils.attachResponseAbortListener(res)

	let body: Buffer | undefined
	try {
		body = await utils.requestBody(res, Number(reqLength))
	} catch {
		if (!res.continue) return
		return void res.cork(() => res.writeStatus("408").endWithoutBody())
	}

	if (!res.continue) return

	new utils.FormValidator()
		.trust({ origin: reqOrigin, referrer: reqReferrer, host: reqHost, body, contentType: reqType })
		.ensureParams(["token", "csrftoken"])
		.useCSRF()
		.do(
			state => confprovider.config.db_enabled ? sql.orm.get("web_tokens", { token: state.params.get("token")! }) : void 0,
			v => v !== void 0,
			[400, "Invalid token"]
		)
		.go()
		.then(state => {
			if (!res.continue) return

			const token = state.params.get("token")
			const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toUTCString()
			res.cork(() => res.writeHeader("Set-Cookie", `token=${token}; path=/; expires=${expires}`))
			utils.redirect(res, "/dash")
		})
		.catch(errorValue => {
			if (!res.continue) return
			res.cork(() => {
				res
					.writeStatus(String(errorValue[0]))
					.writeHeader("Content-Type", "text/plain")
					.writeHeader("Content-Length", String(Buffer.byteLength(errorValue[1])))
					.end(errorValue[1])
			})
		})
})

server.get("/channels/:channelID", async (res, req) => {
	const reqCookie = req.getHeader("cookie")

	const channelID = req.getParameter(0)

	utils.attachResponseAbortListener(res)

	const cookies = utils.getCookies(reqCookie)
	const session = await utils.getSession(cookies)

	new utils.Validator()
		.do(
			() => confprovider.config.dash_enabled,
			true,
			[500, "Dashboard temporarily disabled. Please check back later"]
		)
		.do(
			() => session === null,
			false,
			[400, "NO_SESSION"]
		).do(
			() => confprovider.config.db_enabled
				? redis.GET("voice", session!.user_id) : void 0,
			v => !!v,
			[400, "USER_NOT_IN_CHANNEL"]
		)
		.go()
		.then(async () => {
			if (!res.continue) return

			let html = await fs.promises.readFile(path.join(rootFolder, "templates/channel.html"), { encoding: "utf8" })

			if (!res.continue) return

			const body = confprovider.config.dash_enabled
				? `Dash for ${channelID}`
				: "The dashboard is temporarily disabled. Please check back later"

			html = html
				.replace(bodyRegex, body)
				.replace(channelIDRegex, channelID)
				.replace(timestampRegex, Date.now().toString())

			res.cork(() => {
				res
					.writeStatus("200")
					.writeHeader("Content-Type", "text/html")
					.writeHeader("Content-Length", String(Buffer.byteLength(html)))
					.end(html)
			})
		})
		.catch(() => {
			if (!res.continue) return
			utils.redirect(res, "/dash")
		})
})
