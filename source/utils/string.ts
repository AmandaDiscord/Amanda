import util from "util"

export async function stringify(data: unknown, depth = 0, returnRaw = false): Promise<string> {
	let result: string
	if (data === undefined) result = "(undefined)"
	else if (data === null) result = "(null)"
	else if (typeof (data) === "function") result = "(function)"
	else if (typeof (data) === "string") result = `"${data}"`
	else if (typeof (data) === "number") result = data.toString()
	else if (data instanceof Promise) return stringify(await data, depth, returnRaw)
	else if (data instanceof Error) {
		const errorObject = {}
		Object.entries(data).forEach(e => errorObject[e[0]] = e[1])
		result = `\`\`\`\n${data.stack}\`\`\` ${await stringify(errorObject)}`
	} else {
		const pre = util.inspect(data, { depth: depth })
		result = returnRaw ? pre : `${pre.length < 2000 ? "```js\n" : ""}${pre}${pre.length < 2000 ? "```" : ""}`
	}
	if (result.length >= 2000 && !returnRaw) {
		if (result.startsWith("```")) result = `${result.slice(0, 1995).replace(/`+$/, "").replace(/\n\s+/ms, "")}…\`\`\``
		else result = `${result.slice(0, 1998)}…`
	}
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

/**
 * Converts a string to a bigint. The string may include commas.
 */
export function parseBigInt(value: string) {
	const numstr = value.replace(/,/g, "")
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

export function tableifyRows(rows: Array<Array<string>>, align: Array<"left" | "right" | "none">, surround: (currentLine: number) => string = () => "", spacer = " ") { // SC: en space
	const output = [] as Array<string>
	const maxLength = [] as Array<number>
	for (let i = 0; i < rows[0].length; i++) {
		let thisLength = 0
		for (const row of rows) {
			if (thisLength < row[i].length) thisLength = row[i].length
		}
		maxLength.push(thisLength)
	}
	for (let i = 0; i < rows.length; i++) {
		let line = ""
		for (let j = 0; j < rows[0].length; j++) {
			if (align[j] == "left" || align[j] == "right") {
				line += surround(i)
				if (align[j] == "left") {
					const pad = " ​"
					const padding = pad.repeat(maxLength[j] - rows[i][j].length)
					line += rows[i][j] + padding
				} else if (align[j] == "right") {
					const pad = "​ "
					const padding = pad.repeat(maxLength[j] - rows[i][j].length)
					line += padding + rows[i][j]
				}
				line += surround(i)
			} else {
				line += rows[i][j]
			}
			if (j < rows[0].length - 1) line += spacer
		}
		output.push(line)
	}
	return output
}

export function removeMiddleRows(rows: Array<string>, maxLength = 2000, joinLength = 1, middleString = "…") {
	let currentLength = 0
	let currentItems = 0
	const maxItems = 20
	/**
	 * Holds items for the left and right sides.
	 * Items should flow into the left faster than the right.
	 * At the end, the sides will be combined into the final list.
	 */
	const reconstruction = new Map<"left" | "right", Array<string>>([
		["left", []],
		["right", []]
	])
	let leftOffset = 0
	let rightOffset = 0
	function getNextDirection() {
		return rightOffset * 3 > leftOffset ? "left" : "right"
	}
	while (currentItems < rows.length) {
		const direction = getNextDirection()
		let row: string
		if (direction == "left") row = rows[leftOffset++]
		else row = rows[rows.length - 1 - rightOffset++]
		if (currentItems >= maxItems || currentLength + row.length + joinLength + middleString.length > maxLength) {
			return reconstruction.get("left")!.concat([middleString], reconstruction.get("right")!.reverse())
		}
		reconstruction.get(direction)!.push(row)
		currentLength += row.length + joinLength
		currentItems++
	}
	return reconstruction.get("left")!.concat(reconstruction.get("right")!.reverse())
}

export default exports as typeof import("./string")
