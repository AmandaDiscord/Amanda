import replace from "@amanda/lang/replace"

import passthrough from "../passthrough"
const { sync } = passthrough

const orm = sync.require("./orm") as typeof import("./orm")

import Lang from "@amanda/lang"

export async function getLang(id: string, type: "self" | "guild"): Promise<import("@amanda/lang").Lang> {
	let code: string, row: { value: string } | undefined
	if (type === "self") {
		row = await orm.db.get("settings_self", { key_id: id, setting: "language" }, { select: ["value"] })
	} else if (type === "guild") {
		row = await orm.db.get("settings_guild", { key_id: id, setting: "language" }, { select: ["value"] })
	}
	if (row) {
		code = row.value
	} else {
		code = "en-us"
	}

	return Lang[code.replace("-", "_")] || Lang.en_us
}

export { replace }

export default exports as typeof import("./language")
