import Lang from "@amanda/lang"
import replace from "@amanda/lang/replace"

export function getLang(id: string): import("@amanda/lang").Lang {
	const code = id.toLowerCase().replace("-", "_")
	return Lang[code] || Lang.en_us
}

export { replace }

export default exports as typeof import("./language")
