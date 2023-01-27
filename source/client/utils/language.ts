import Lang from "@amanda/lang"
import replace from "@amanda/lang/replace"

const dashRegex = /-/g

export function getLang(id: string): import("@amanda/lang").Lang {
	const code = id.toLowerCase().replace(dashRegex, "_")
	return Lang[code] || Lang.en_us
}

export { replace }

export default exports as typeof import("./language")
