import util = require("util")

export async function stringify(data: unknown, depth = 0, returnRaw = false): Promise<string> {
	let result: string
	if (data === undefined) result = "(undefined)"
	else if (data === null) result = "(null)"
	else if (typeof (data) === "function") result = "(function)"
	else if (typeof (data) === "string") result = `"${data}"`
	else if (typeof (data) === "number") result = data.toString()
	else if (typeof (data) === "bigint") result = `${data.toString()}n`
	else if (data instanceof Promise) return stringify(await data, depth, returnRaw)
	else if (data instanceof Error) {
		const errorObject = {}
		Object.entries(data).forEach(e => errorObject[e[0]] = e[1])
		result = `${data.stack}${returnRaw ? "\n" : "```\n```"}${await stringify(errorObject, depth, returnRaw)}`
	} else result = util.inspect(data, { depth: depth })
	if (result.length >= 2000 && !returnRaw) result = `\`\`\`js\n${result.slice(0, 1995)}…\`\`\``
	return result
}

export function progressBar(length: number, value: number, max: number, text?: string) {
	if (!text) text = ""
	const textPosition = Math.floor(length / 2) - Math.ceil(text.length / 2) + 1
	let result = ""
	for (let i = 1; i <= length; i++) {
		if (i >= textPosition && i < textPosition + text.length) {
			result += text[i - textPosition]
		} else {
			if (value / max * length >= i) result += "="
			else result += " ​" // space + zwsp to prevent shrinking
		}
	}
	return `​${result}` // zwsp + result
}

/**
 * Converts anything resolvable to a BigInt to a string with commas where they should go
 */
export function numberComma(value: number | string | bigint) {
	return BigInt(value).toLocaleString()
}

const commaRegex = /,/g

/**
 * Converts a string to a bigint. The string may include commas.
 */
export function parseBigInt(value: string) {
	const numstr = value.replace(commaRegex, "")
	if (!/^\d+$/.exec(numstr)) return null
	return BigInt(numstr)
}

export function position(pos: number | bigint) {
	let value = pos.toString()
	if (value.endsWith("1")) {
		if (value.slice(value.length - 2, value.length) == "11") value += "th"
		else value += "st"
	} else if (value.endsWith("2")) {
		if (value.slice(value.length - 2, value.length) == "12") value += "th"
		else value += "nd"
	} else if (value.endsWith("3")) {
		if (value.slice(value.length - 2, value.length) == "13") value += "th"
		else value += "rd"
	} else if (["0", "4", "5", "6", "7", "8", "9"].find(e => value.endsWith(e))) value += "th"
	return value
}

export function abbreviateNumber(value: number | string | bigint, precision = 2) {
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
