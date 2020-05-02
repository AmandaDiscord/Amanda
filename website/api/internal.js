// @ts-check

const { ipc } = require("../passthrough")

module.exports = [
	{
		route: "/api/reload/lang", methods: ["GET"], code: async ({req}) => {
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
	}
]
