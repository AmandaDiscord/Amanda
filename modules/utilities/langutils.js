// @ts-check

const replace = require("@amanda/lang/replace")

const passthrough = require("../../passthrough")
const { sync } = passthrough


/** @type {import("./orm")} */
const orm = sync.require("./orm")

const Lang = require("@amanda/lang")

/**
 * @param {string} id
 * @param {"self"|"guild"} type
 * @returns {Promise<import("@amanda/lang").Lang>}
 */
async function getLang(id, type) {
	let code, row
	if (type === "self") {
		row = await orm.db.get("settings_self", { key_id: id, setting: "language" })
	} else if (type === "guild") {
		row = await orm.db.get("settings_guild", { key_id: id, setting: "language" })
	}
	if (row) {
		code = row.value
	} else {
		code = "en-us"
	}

	return Lang[code.replace("-", "_")] || Lang.en_us
}

module.exports.getLang = getLang
module.exports.replace = replace
