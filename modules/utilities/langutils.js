// @ts-check

const path = require("path")
const replace = require("@amanda/lang/replace")

const passthrough = require("../../passthrough")
const { reloadEvent } = passthrough

const { addTemporaryListener } = require("./eventutils")
const sql = require("./sql")

/** @type {typeof import("@amanda/lang")} */
let Lang
Lang = require("@amanda/lang") // TS yells at us if we try to initialize it with the require

addTemporaryListener(reloadEvent, "@amanda/lang", path.basename(__filename), () => {
	Lang = require("@amanda/lang")
})

/**
 * @param {string} id
 * @param {"self"|"guild"} type
 * @returns {Promise<import("@amanda/lang").Lang>}
 */
async function getLang(id, type) {
	let code, row
	if (type === "self") {
		row = await sql.get("SELECT * FROM settings_self WHERE key_id = $1 AND setting = $2", [id, "language"])
	} else if (type === "guild") {
		row = await sql.get("SELECT * FROM settings_guild WHERE key_id = $1 AND setting = $2", [id, "language"])
	}
	if (row) {
		code = row.value
	} else {
		code = "en-us"
	}

	const value = Lang[code.replace("-", "_")] || Lang.en_us
	return value
}

module.exports.getLang = getLang
module.exports.replace = replace
