// @ts-check

const fs = require("node:fs")
const path = require("node:path")

const config = require("../../config.example")

let dtsString = "declare namespace Config {\n"

/**
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
	return typeof value === "object"
		? Array.isArray(value)
			? `Array<${value[0] === undefined ? "unknown" : describe(value[0])}>`
			: value === null
				? "null"
				: value instanceof RegExp
					? "RegExp"
					// @ts-expect-error Accessing any keys is ok
					: `{ ${Object.keys(value).map(k => `${k}: ${describe(value[k])}`).join(", ")} }`
		: typeof value === "function"
			? "(...args: any[]) => any"
			: typeof value
}

for (const [key, value] of Object.entries(config)) {
	const val = describe(value)
	dtsString += `\tconst ${key}: ${val}\n`
}

dtsString += "}\nexport = Config"

fs.writeFileSync(path.join(__dirname, "./config.d.ts"), dtsString)
console.log("Generated config d.ts")
