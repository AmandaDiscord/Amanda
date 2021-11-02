// @ts-check

const STEndpoints = require("snowtransfer/dist/Endpoints")
const centra = require("centra")

const { ipc, sync, snow } = require("../passthrough")
/** @type {import("../modules/utilities")} */
const utils = sync.require("../modules/utilities.js")

module.exports = [
	{
		route: "/api/reload/lang", methods: ["GET"], code: async ({ req }) => {
			console.log(req.headers)
			let acceptable = true
			if ("x-real-ip" in req.headers) {
				acceptable = false
				const realIP = req.headers["x-real-ip"]
				console.log("found real ip:", realIP)
				if (realIP === "127.0.0.1" || realIP === "::1") {
					acceptable = true
				}
			}
			if (acceptable) {
				ipc.replier.broadcast("RELOAD_LANG", null) // TODO: probably won't work with clusters
				return {
					statusCode: 200,
					contentType: "text/plain; charset=UTF-8",
					content: "Success.\n"
				}
			} else {
				return {
					statusCode: 404,
					contentType: "text/plain; charset=UTF-8",
					content: "404 Not Found"
				}
			}
		}
	},
	{
		route: "/api/avatar/(\\d+)", methods: ["GET"], code: async ({ fill }) => {
			const userID = fill[0]
			const user = await utils.sql.get("SELECT avatar, tag FROM users WHERE id = $1", userID)
			const template404 = { statusCode: 404, contentType: "text/plain; charset=UTF-8", content: "404 Not Found" }
			if (!user || (user && !user.tag)) return template404
			const discriminator = user.tag.split("#").slice(-1)[0]
			const avatar = await centra(user.avatar ? `${STEndpoints.CDN_URL}/avatars/${userID}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png?size=128"}` : `${STEndpoints.CDN_URL}/embed/avatars/${Number(discriminator) % 5}.png`, "get").send()
			if (avatar.statusCode !== 200) {
				let updated
				try {
					updated = await snow.user.getUser(userID)
				} catch {
					return template404
				}
				await utils.sql.all("UPDATE users SET tag = $1, avatar = $2 WHERE id = $3", [`${updated.username}#${updated.discriminator}`, updated.avatar, userID])
				const final = await centra(updated.avatar ? `${STEndpoints.CDN_URL}/avatars/${userID}/${updated.avatar}.${updated.avatar.startsWith("a_") ? "gif" : "png?size=128"}` : `${STEndpoints.CDN_URL}/embed/avatars/${Number(updated.discriminator) % 5}.png`).send()
				return { statusCode: 200, contentType: `image/${updated.avatar && updated.avatar.startsWith("a_") ? "gif" : "png"}`, content: final.body }
			}
			return { statusCode: 200, contentType: `image/${user.avatar && user.avatar.startsWith("a_") ? "gif" : "png"}`, content: avatar.body }
		}
	}
]
