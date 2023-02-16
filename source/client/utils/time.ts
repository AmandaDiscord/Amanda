import passthrough = require("../../passthrough")
const { sync } = passthrough

const text: typeof import("./string") = sync.require("./string")

const defaultPrecision = ["d", "h", "m", "s"] as const

export function upcomingDate(date: Date) {
	const currentHours = date.getUTCHours()
	let textHours = ""
	if (currentHours < 12) textHours += `${currentHours} AM`
	else textHours = `${currentHours - 12} PM`
	return `${date.toUTCString().split(" ").slice(0, 4).join(" ")} at ${textHours} UTC`
}

export function getSixTime(when: Date | string, seperator: string) {
	const d = new Date(when || Date.now())
	if (!seperator) seperator = ""
	return d.getHours().toString().padStart(2, "0") + seperator + d.getMinutes().toString().padStart(2, "0") + seperator + d.getSeconds().toString().padStart(2, "0")
}

export function shortTime(number: number, scale: "ms" | "sec", precision: ReadonlyArray<"d" | "h" | "m" | "s"> = defaultPrecision) {
	if (isNaN(number)) throw new TypeError("Input provided is NaN")
	if (!scale) throw new RangeError("Missing scale")
	if (scale.toLowerCase() == "ms") number = Math.floor(number)
	else if (scale.toLowerCase() == "sec") number = Math.floor(number * 1000)
	else throw new TypeError("Invalid scale provided")
	const days = Math.floor(number / 1000 / 60 / 60 / 24)
	number -= days * 1000 * 60 * 60 * 24
	const hours = Math.floor(number / 1000 / 60 / 60)
	number -= hours * 1000 * 60 * 60
	const mins = Math.floor(number / 1000 / 60)
	number -= mins * 1000 * 60
	const secs = Math.floor(number / 1000)
	let timestr = ""
	if (days > 0 && precision.includes("d")) timestr += `${days}d `
	if (hours > 0 && precision.includes("h")) timestr += `${hours}h `
	if (mins > 0 && precision.includes("m")) timestr += `${mins}m `
	if (secs > 0 && precision.includes("s")) timestr += `${secs}s`
	if (!timestr) timestr = `0${precision.slice(-1)[0]}`
	return timestr
}

const reg = /(\d+) ?(\w+)?/
const inputSplitter = /(?! [^\d]+) /g

export function parseDuration(input: string) {
	if (!input) return null
	const individual = input.split(inputSplitter)
	let totalTime = 0
	for (const frame of individual) {
		const test = frame.match(reg)
		if (test == null) return null
		if (!test[1]) return null
		const [duration, identifier] = [test[1], test[2]]
		const num = Number(text.parseBigInt(duration))
		if (!num) return null
		let multiply = 1
		if (identifier) {
			if (identifier.startsWith("w")) multiply = 1000 * 60 * 60 * 24 * 7
			else if (identifier.startsWith("d")) multiply = 1000 * 60 * 60 * 24
			else if (identifier.startsWith("h")) multiply = 1000 * 60 * 60
			else if (identifier.startsWith("ms") || identifier.startsWith("mil")) multiply = 1000
			else if (identifier.startsWith("m")) multiply = 1000 * 60
			else if (identifier.startsWith("s")) multiply = 1000
		}
		totalTime += (num * multiply)
	}
	return totalTime
}

export function prettySeconds(seconds: number) {
	let minutes = Math.floor(seconds / 60)
	seconds = seconds % 60
	const hours = Math.floor(minutes / 60)
	minutes = minutes % 60
	const output = [] as Array<number | string>
	if (hours) {
		output.push(hours)
		output.push(minutes.toString().padStart(2, "0"))
	} else {
		output.push(minutes)
	}
	output.push(seconds.toString().padStart(2, "0"))
	return output.join(":")
}
