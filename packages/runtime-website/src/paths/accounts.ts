import fs = require("fs")
import path = require("path")
import { createHash } from "crypto"

import sql = require("@amanda/sql")

import passthrough = require("../passthrough");
const { server, sync, rootFolder, confprovider } = passthrough

const utils: typeof import("../utils") = sync.require("../utils")

const lastfmKeyRegex = /\$lastfmkey/gm
const lastfmCallback = /\$lastfmcallback/gm
const connectionsRegex = /\$connections/gm

server.get("/link", async (res, req) => {
	const reqCookie = req.getHeader("cookie")

	utils.attachResponseAbortListener(res)

	const cookies = utils.getCookies(reqCookie)
	const session = await utils.getSession(cookies)

	if (!res.continue) return

	if (session && confprovider.config.db_enabled) {
		const [template, connections] = await Promise.all([
			fs.promises.readFile(path.join(rootFolder, "./templates/link.html"), { encoding: "utf-8" }),
			sql.orm.select("connections", { user_id: session.user_id })
		])

		if (!res.continue) return

		const csrftoken = utils.generateCSRF(session.token)

		const connectionsString = !connections.length
			? "None"
			: connections.map(c =>
				"<form action=\"/unlink\" method=\"post\">" +
					`<input type="hidden" id="csrftoken" name="csrftoken" value="${csrftoken}">` +
					`<input type="hidden" id="type" name="type" value="${c.type}">` +
					`<button type="submit">Unlink ${c.type}</button>` +
				"</form>"
			).join("<br>")

		const baseWebsiteCallback = `${confprovider.config.website_protocol}://${confprovider.config.website_domain}/flow?user_id=${session.user_id}`

		const html = template
			.replace(lastfmKeyRegex, confprovider.config.lastfm_key)
			.replace(lastfmCallback, encodeURIComponent(`${baseWebsiteCallback}&type=lastfm`))
			.replace(connectionsRegex, connectionsString)

		res.cork(() => {
			res
				.writeStatus("200")
				.writeHeader("Content-Type", "text/html")
				.writeHeader("Content-Length", String(Buffer.byteLength(html)))
				.end(html)
		})
	} else {
		if (!res.continue) return
		utils.redirect(res, "/login")
	}
})

server.post("/unlink", async (res, req) => {
	const reqCookie = req.getHeader("cookie")
	const reqLength = req.getHeader("content-length")
	const reqType = req.getHeader("content-type")
	const reqOrigin = req.getHeader("origin")
	const reqReferrer = req.getHeader("referrer")
	const reqHost = req.getHeader("host")

	if (!reqLength || isNaN(Number(reqLength))) return void res.writeStatus("411").endWithoutBody()
	if (Number(reqLength) > 130) return void res.writeStatus("413").endWithoutBody()
	if (reqType !== "application/x-www-form-urlencoded") return void res.writeStatus("415").endWithoutBody()

	utils.attachResponseAbortListener(res)

	const cookies = utils.getCookies(reqCookie)
	const session = await utils.getSession(cookies)

	if (!res.continue) return

	if (!session) return void res.cork(() => res.writeStatus("401").endWithoutBody())


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
		.ensureParams(["type", "csrftoken"])
		.useCSRF(session.token)
		.do(
			state => confprovider.config.db_enabled
				? sql.orm.get("connections", {
					user_id: session.user_id,
					type: state.params.get("type") as unknown as undefined
				})
				: void 0,
			v => v !== void 0,
			[400, "Connection not linked"]
		)
		.go()
		.then(async (state) => {
			if (!res.continue) return

			await sql.orm.delete("connections", {
				user_id: session.user_id,
				type: state.params.get("type") as unknown as undefined
			}).catch(console.error)

			res.cork(() => {
				res
					.writeStatus("200")
					.writeHeader("Content-Type", "text/plain")
					.end("Logged out successfully")
			})
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

server.get("/flow", (res, req) => {
	let searchParams: URLSearchParams | undefined
	try {
		searchParams = new URLSearchParams(req.getQuery())
	} catch {
		res
			.writeStatus("500")
			.endWithoutBody()
		return
	}

	utils.attachResponseAbortListener(res)

	new utils.Validator()
		.do(
			() => searchParams!.has("user_id") && searchParams!.has("token") && searchParams!.has("type"),
			true,
			[400, "Missing params"]
		).do(
			() => sql.orm.get("connections", {
				user_id: searchParams!.get("user_id")!,
				type: searchParams!.get("type") as unknown as undefined
			}).then(r => !r),
			true,
			[403, "Already connected"]
		).do(
			() => confprovider.config.db_enabled,
			true,
			[500, "Database not enabled"]
		).do(
			async () => {
				if (!res.continue) return ""

				const type = searchParams!.get("type")

				if (type === "lastfm") {
					const params = new URLSearchParams({
						method: "auth.getSession",
						token: searchParams!.get("token")!,
						api_key: confprovider.config.lastfm_key
					})

					const orderedWithSecret = `${Array.from(params.keys()).sort((a, b) => a.localeCompare(b)).map(param => `${param}${params.get(param)!}`).join("")}${confprovider.config.lastfm_sec}`
					const signature = createHash("md5").update(orderedWithSecret).digest("hex")
					const session = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}&api_sig=${signature}&format=json`)
						.then(d => d.json())
					return session.session.key as string
				} else throw new Error("INVALID_TYPE")
			},
			i => !!i,
			[400, "Invalid token"],
			"access"
		)
		.go()
		.then(async (state) => {
			await sql.orm.insert("connections", {
				user_id: searchParams!.get("user_id")!,
				access: state.access,
				type: searchParams!.get("type") as unknown as undefined
			}).catch(console.error)

			if (res.continue) utils.redirect(res, "/link")
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
