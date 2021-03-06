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
 * Converts anything resolvable to a BigInt to a string with commas where they should go
 * @param {number | string | bigint} number
 */
function numberComma(number) {
	return BigInt(number).toLocaleString()
}

/**
 * Converts a string to a bigint. The string may include commas.
 * @param {string} string
 */
function parseBigInt(string) {
	const numstr = string.replace(/,/g, "")
	if (!/^\d+$/.exec(numstr)) return null
	return BigInt(numstr)
}

/**
 * @param {number} pos
 */
function numberPosition(pos) {
	const str = pos.toString()
	let value = `${pos}`
	if (str.endsWith("1")) {
		if (str.slice(str.length - 2, str.length) == "11") value += "th"
		else value += "st"
	} else if (str.endsWith("2")) {
		if (str.slice(str.length - 2, str.length) == "12") value += "th"
		else value += "nd"
	} else if (str.endsWith("3")) {
		if (str.slice(str.length - 2, str.length) == "13") value += "th"
		else value += "rd"
	} else if (["0", "4", "5", "6", "7", "8", "9"].find(e => str.endsWith(e))) value += "th"
	return value
}

/**
 * @param {number | string | bigint} value
 */
function abbreviateNumber(value, precision = 2) {
	const converted = BigInt(value)
	if (converted >= BigInt(10000)) { // values less than 10,000 don't have to be shortened for us. If you're implementing this elsewhere, feel free to remove this.
		const identifiers = ["", "k", "m", "b", "t", "qua", "qui", "sex", "sep"]
		const split = converted.toLocaleString().split(",")
		const index = split.length - 1

		if (index > identifiers.length - 1) return `${(BigInt(split[0]) * (BigInt(1000) * BigInt(index - identifiers.length - 1))).toLocaleString()} ${identifiers.slice(-1)[0]}` // Because BigInts can be HUGE
		else return `${Number(split[0])}${split[1] && Number(split[1]) !== 0 ? "." : ""}${split[1] && Number(split[1]) !== 0 ? split[1].slice(0, precision) : ""}${identifiers[index]}`
	}
	return converted.toLocaleString()
}

module.exports.progressBar = progressBar
module.exports.stringify = stringify
module.exports.numberComma = numberComma
module.exports.parseBigInt = parseBigInt
module.exports.numberPosition = numberPosition
module.exports.abbreviateNumber = abbreviateNumber
