// @ts-check

/** @param {Date} date */
function upcomingDate(date) {
	const currentHours = date.getUTCHours()
	let textHours = ""
	if (currentHours < 12) textHours += `${currentHours} AM`
	else textHours = `${currentHours - 12} PM`
	return `${date.toUTCString().split(" ").slice(0, 4).join(" ")} at ${textHours} UTC`
}

/**
 * @param {Date|string} when
 * @param {string} seperator
 */
function getSixTime(when, seperator) {
	const d = new Date(when || Date.now())
	if (!seperator) seperator = ""
	return d.getHours().toString().padStart(2, "0") + seperator + d.getMinutes().toString().padStart(2, "0") + seperator + d.getSeconds().toString().padStart(2, "0")
}

/**
 * @param {number} number
 * @param {"ms" | "sec"} scale
 */
function shortTime(number, scale, precision = ["d", "h", "m", "s"]) {
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

/**
 * @param {string} input
 * @returns {number | null}
 */
function parseDuration(input) {
	if (!input) return null
	const individual = input.split(/(?! [^\d]+) /g)
	let totalTime = 0
	for (const frame of individual) {
		const reg = /([\d]+) ?([\w]+)?/
		const test = frame.match(reg)
		if (test == null) return null
		if (!test[1]) return null
		/** @type [string, string, string] */
		const [inp, duration, identifier] = [test[0], test[1], test[2]]
		const num = Number(duration)
		if (isNaN(num)) return null
		let multiply = 1
		if (identifier) {
			if (identifier.startsWith("w")) multiply = 1000 * 60 * 60 * 24 * 7
			else if (identifier.startsWith("d")) multiply = 1000 * 60 * 60 * 24
			else if (identifier.startsWith("h")) multiply = 1000 * 60 * 60
			else if (identifier.startsWith("ms") || identifier.startsWith("mil")) multiply = 1000
			else if (identifier.startsWith("m")) multiply = 1000 * 60
			else if (identifier.startsWith("s")) multiply = 1000
		}
		totalTime += num * multiply
	}
	return totalTime
}

module.exports.upcomingDate = upcomingDate
module.exports.getSixTime = getSixTime
module.exports.shortTime = shortTime
module.exports.parseDuration = parseDuration
