// @ts-check

const util = require("util")

/**
 * @param {any} data
 * @returns {Promise<string>}
 */
async function stringify(data, depth = 0, returnRaw = false) {
	/** @type {string} */
	let result
	if (data === undefined) result = "(undefined)"
	else if (data === null) result = "(null)"
	else if (typeof (data) == "function") result = "(function)"
	else if (typeof (data) == "string") result = `"${data}"`
	else if (typeof (data) == "number") result = data.toString()
	else if (data instanceof Promise) return stringify(await data, depth, returnRaw)
	else if (data.constructor && data.constructor.name && data.constructor.name.toLowerCase().includes("error")) {
		const errorObject = {}
		Object.entries(data).forEach(e => {
			errorObject[e[0]] = e[1]
		})
		result = `\`\`\`\n${data.stack}\`\`\` ${await stringify(errorObject)}`
	} else {
		const pre = util.inspect(data, { depth: depth })
		result = `${pre.length < 2000 ? "```js\n" : ""}${pre}${pre.length < 2000 ? "```" : ""}`
	}

	if (result.length >= 2000 && !returnRaw) {
		if (result.startsWith("```")) result = `${result.slice(0, 1995).replace(/`+$/, "").replace(/\n\s+/ms, "")}…\`\`\``
		else result = `${result.slice(0, 1998)}…`
	}
	return result
}

/**
 * @param {number} length
 * @param {number} value
 * @param {number} max
 * @param {string} [text=""]
 */
function progressBar(length, value, max, text) {
	if (!text) text = ""
	const textPosition = Math.floor(length / 2) - Math.ceil(text.length / 2) + 1
	let result = ""
	for (let i = 1; i <= length; i++) {
		if (i >= textPosition && i < textPosition + text.length) {
			result += text[i - textPosition]
		} else {
			// eslint-disable-next-line no-lonely-if
			if (value / max * length >= i) result += "="
			else result += " ​" // space + zwsp to prevent shrinking
		}
	}
	return `​${result}` // zwsp + result
}

/**
 * Converts a number to a string then adds commas where they should go. https://stackoverflow.com/a/2901298
 * @param {number} number
 */
function numberComma(number) {
	return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * Converts a string to a number. The string may include commas.
 * @param {string} string
 */
function parseNumber(string) {
	const numstr = string.replace(/,/g, "")
	const num = Number(numstr)
	if (isNaN(num)) return NaN
	else return num
}

module.exports.progressBar = progressBar
module.exports.stringify = stringify
module.exports.numberComma = numberComma
module.exports.parseNumber = parseNumber
