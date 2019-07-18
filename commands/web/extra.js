const path = require("path")
const crypto = require("crypto")

module.exports = function(passthrough) {
	let {reloader} = passthrough

	let utils = require("../../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	return {
		/**
		 * Convert a browser cookie string into a map.
		 * @param {Object} req req, from HTTP.Server
		 * @returns {Map}
		 */
		getCookies: function(req) {
			let result = new Map()
			if (req.headers.cookie) {
				req.headers.cookie.split(/; */).forEach(pair => {
					let eqIndex = pair.indexOf("=")
					if (eqIndex > 0) {
						let key = pair.slice(0, eqIndex)
						let value = pair.slice(eqIndex+1)
						result.set(key, value)
					}
				})
			}
			return result
		},

		getSession: function(token) {
			if (token instanceof Map) token = token.get("token")
			if (token) return utils.sql.get("SELECT * FROM WebTokens WHERE token = ?", token)
			else return Promise.resolve(null)
		},

		getURLEncoded: function(body) {
			try {
				return new URLSearchParams(body)
			} catch (e) {
				throw [400, {message: "Malformed URL encoded body"}]
			}
		},

		generateCSRF: function(loginToken = null) {
			let token = crypto.randomBytes(32).toString("hex")
			utils.sql.all("INSERT INTO CSRFTokens (token, loginToken) VALUES (?, ?)", [token, loginToken])
			return token
		},

		checkCSRF: async function(token, loginToken, consume) {
			let result = true
			let row = await utils.sql.get("SELECT * FROM CSRFTokens WHERE token = ?", token)
			// Token doesn't exist? Fail.
			if (!row) result = false
			// Checking against a loginToken, but row loginToken differs? Fail.
			else if (loginToken && row.loginToken != loginToken) result = false
			// Looking good.
			if (consume) await utils.sql.all("DELETE FROM CSRFTokens WHERE token = ?", token)
			return result
		}
	}
}