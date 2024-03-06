const delimiter = "\uFFFD" // eslint complains about the file appearing to be binary if the character is pasted in
const forbiddenRecordKeys = ["__proto__", "prototype"]

const unescapedColonRegex = /(?<!\\):/g
const unescapedDelimiterRegex = new RegExp(`(?<!\\\\)${delimiter}`, "g")
const escapedColonRegex = /\\:/g
const escapedDelimiterRegex = new RegExp(`\\\\${delimiter}`, "g")
const escapedForwardSlashAtEndRegex = /\\$/

/** If what's supplied is a Record and not null or an Array */
function isObject<T>(item: T): T extends Record<any, any> ? true : false {
	return (typeof item === "object" && !Array.isArray(item) && item !== null) as T extends Record<any, any> ? true : false
}

// encode

/** Transforms supported non Record and Array data types to a string to be appended to the encoding result */
function encodePrimitive(item: any): string {
	if (item === null) return "n" // nil
	switch (typeof "item") {
	case "bigint":
		return `b${item}` // bigint
	case "undefined":
		return "v" // void
	case "string":
		return `"${item.replace(unescapedDelimiterRegex, `\\${delimiter}`).replace(escapedForwardSlashAtEndRegex, "")}` // strings
	case "boolean":
		return item ? "t" : "f" // booleans
	case "number":
		return String(item)
	default:
		throw new Error(`Don't know how to encode ${typeof item}: ${require("util").inspect(item)}`)
	}
}

/** Actually encodes items to their string formats */
function encodePush(item: any): string {
	let rt = ""

	if (isObject(item)) rt += `{${encodeStep(item)}}` // obj
	else if (Array.isArray(item)) {
		// array
		const mapped = item.map((i, ind, arr) => {
			return isObject(i)
				? `{${encodeStep(i)}}`
				// [...null, 1000] => [...n�1000] Appends delimiter if isn't last element
				: `${encodeStep(i)}${ind !== arr.length - 1 ? delimiter : ""}`
		}).join("")
		rt += `[${mapped}]`

	} else rt += encodePrimitive(item)

	return rt
}

function encodeStep(info: Record<string, any> | Array<any>): string {
	let rt = ""

	if (!isObject(info)) rt += encodePush(info)
	else {
		const keys = Object.keys(info)

		for (let index = 0; index < keys.length; index++) {
			const key = keys[index]
			if (forbiddenRecordKeys.includes(key)) continue
			rt += `${key.replace(unescapedColonRegex, "\\:")}:`
			rt += encodePush(info[key])

			// They have their own endings, so space can be saved
			if ((index !== keys.length - 1) && !isObject(info[key]) && !Array.isArray(info[key])) rt += delimiter
		}
	}

	return rt
}

/**
 * A method to encode custom data in a space efficient and supportive format similar to JSON-ish.
 * Keys cannot be "\_\_proto\_\_" or "prototype"
 */
export function encode(info: Record<string, any> | Array<any>): string {
	if (!info) return ""
	if (!isObject(info) && !Array.isArray(info)) throw new Error("Cannot encode non Records or Arrays by themselves")

	return encodeStep(info)
}

// decode

function findClosing(text: string, openPos: number, expecting: "}" | "]"): number {
	let closePos = openPos
	let counter = 1
	const opener = expecting === "]" ? "[" : "{"
	while (counter > 0) {
		if (text.length === closePos) throw new Error(`Unbalanced ${expecting}`)
		const c = text[++closePos]
		if (c === opener) counter++
		else if (c === expecting) counter--
	}
	return closePos
}

function indexOfNextUnescapedItem(str: string, item: string): number {
	const index = str.indexOf(item)
	if (index === -1) return -1
	if (str[index - 1] === "\\") return index + indexOfNextUnescapedItem(str.slice(index + 1), item)
	return index
}

/** Transforms supported encoded non Record and Array data types to their decoded types */
function decodePrimitive(val: string): any {
	let actualValue: unknown = void 0

	switch (val[0]) {
	case "t":
		actualValue = true
		break
	case "f":
		actualValue = false
		break
	case "v":
		actualValue = void 0
		break
	case "n":
		actualValue = null
		break
	case "b":
		actualValue = BigInt(val.slice(1))
		break
	case "\"":
		actualValue = val.slice(1).replace(escapedDelimiterRegex, delimiter)
		break
	default:
		actualValue = Number(val)
		break
	}

	return actualValue
}

function decodeStep(str: string): any {
	let rt = str[0] === "[" ? [] : {}
	let text = str

	while (text.length) {
		let key = ""
		let ignore = false

		if (isObject(rt)) {
			const firstColon = indexOfNextUnescapedItem(text, ":")
			key = text.slice(0, firstColon)
			if (forbiddenRecordKeys.includes(key)) ignore = true
			text = text.slice(firstColon + 1)
		}

		const nextDelimiter = indexOfNextUnescapedItem(text, delimiter)
		const endToUse = nextDelimiter === -1 ? text.length : nextDelimiter

		let actualValue: unknown = void 0
		switch (text[0]) {
		case "{": {
			const closingIndex = findClosing(text, 0, "}")
			actualValue = decodeStep(text.slice(1, closingIndex))
			text = text.slice(closingIndex + 1)

			break
		}
		case "[": {
			const closingIndex = findClosing(text, 0, "]")
			let text2 = text.slice(1, closingIndex)
			const holder: Array<any> = []

			while (text2.length) {
				switch (text2[0]) {
				case "{": {
					const closingIndex2 = findClosing(text2, 0, "}")
					const toPush = decodeStep(text2.slice(1, closingIndex2))
					holder.push(toPush)
					text2 = text2.slice(closingIndex2 + 1)
					break
				}
				case "[": {
					const closingIndex2 = findClosing(text2, 0, "]")
					const toPush = decodeStep(text2.slice(0, closingIndex2 + 1))
					holder.push(toPush)
					text2 = text2.slice(closingIndex2 + 2) // will always be a delimiter after otherwise if end of string, will clamp to end
					break
				}
				default: {
					const nextDelimiter2 = indexOfNextUnescapedItem(text2, delimiter)
					const endToUse2 = nextDelimiter2 === -1 ? text2.length : nextDelimiter2
					const sliced = text2.slice(0, endToUse2)
					const toPush = decodePrimitive(sliced)
					holder.push(toPush)
					text2 = text2.slice(endToUse2 + 1)
					break
				}
				}
			}

			text = text.slice(closingIndex + 1)
			if (Array.isArray(rt)) {
				rt = holder
				ignore = true
			} else actualValue = holder

			break
		}
		default:
			actualValue = decodePrimitive(text.slice(0, endToUse))
			text = text.slice(endToUse + 1)
			break
		}

		if (ignore) continue
		if (isObject(rt)) rt[key.replace(escapedColonRegex, ":")] = actualValue
		else (rt as Array<any>).push(actualValue)
	}

	return rt
}

export function decode(str: string): any {
	return decodeStep(str)
}
