import util = require("util")

import language = require("@amanda/lang")
import langReplace = require("@amanda/lang/replace")
import buttons = require("@amanda/buttons")
import confprovider = require("@amanda/config")
import redis = require("@amanda/redis")

import {
	type APIUser,
	type APIGuildMember,
	type APIInteractionDataResolvedGuildMember,
	type APIInteractionGuildMember,
	type APIChatInputApplicationCommandInteraction,

	ComponentType,
	MessageFlags,
	APIComponentInContainer
} from "discord-api-types/v10"
import type { SnowTransfer } from "snowtransfer"
import type { Lang } from "@amanda/lang"
import type { BetterComponent } from "@amanda/buttons"

const commaRegex = /,/g
const dotRegex = /\./g
const spaceRegex = / /g
const colonRegex = /:/g
const dashRegex = /-/g
const durationFrameRegex = /(\d+) ?(\w+)?/
const durationInputSplitterRegex = /(?! [^\d]+) /g
const alignedRowsRegex = /`.+?`/g

/**
 * Wrap promise's return values that will be accessed multiple times without
 * logic strictly to check for if the value exists already
 */
export class AsyncValueCache<T> {
	/** Timeout to expire the cache value if a lifetime was supplied */
	public lifetimeTimeout: NodeJS.Timeout | null = null
	/** The backing Promise from the getter if the getter was called */
	public promise: Promise<T> | null = null
	/** The return value of the Promise once it finishes */
	public cache: T | null = null

	/**
	 * @param getter The function to return the Promise that will be awaited
	 * @param lifetime How much time in ms the cache should last for
	 */
	public constructor(public getter: () => Promise<T>, public lifetime?: number) {}

	/** Dispose of the cached value */
	public clear(): void {
		if (this.lifetimeTimeout) clearTimeout(this.lifetimeTimeout)
		this.cache = null
	}

	/** Function that will return the cache if any or run the getter, returning the value from it and caching that */
	public get(): Promise<T> {
		if (this.cache) return Promise.resolve(this.cache)
		if (this.promise) return this.promise
		return this._getNew()
	}

	private async _getNew(): Promise<T> {
		this.promise = this.getter()
		const result = await this.promise
		this.cache = result
		this.promise = null
		if (this.lifetimeTimeout) clearTimeout(this.lifetimeTimeout)
		if (this.lifetime) this.lifetimeTimeout = setTimeout(() => this.clear(), this.lifetime)
		return result
	}
}

/**
 * Wrapper around NodeJS.Timeout that has handy functions
 * for managing the callback execution
 */
export class BetterTimeout<TArgs extends Array<any> = []> {
	/** If the backing timeout is currently waiting to execute */
	public isActive = false
	/** The backing timeout */
	public timeout: NodeJS.Timeout | null = null
	/** If this timeout will run in an interval */
	public interval: boolean = false

	/**
	 * @param callback The backing function that will run when the timeout finishes or is triggered manually
	 * @param delay How long in ms the timer should run for until the callback triggers automatically
	 * @param args The args that will be passed to the callback function when it's triggered
	 */
	public constructor(
		public callback: ((...TArgs: TArgs) => unknown) | null = null,
		public delay: number | null = null,
		public args?: TArgs
	) {}

	/** Override or set the callback function that will execute when triggered */
	public setCallback(callback: (...TArgs: TArgs) => unknown): this {
		this.clear()
		this.callback = callback
		return this
	}

	/** Override or set how long in ms the timer will run before triggering automatically */
	public setDelay(delay: number): this {
		this.clear()
		this.delay = delay
		return this
	}

	/** Set if this timer will execute the callback in an interval */
	public setAsInterval(interval: boolean): this {
		this.clear()
		this.interval = interval
		return this
	}

	/** Set the args that will be passed to the callback when triggered */
	public setArgs(...args: TArgs): this {
		this.clear()
		this.args = args
		return this
	}

	/**
	 * Start the backing timer
	 * @param delayOverride The time in ms the timeout should run for (useful for first time runs if an interval, but want a delay before interval runs on a separate time)
	 */
	public run(delayOverride?: number): this {
		this.clear()
		if (this.callback && this.delay) {
			this.isActive = true
			this.timeout = setTimeout(() => this.triggerNow(), delayOverride ?? this.delay)
		}
		return this
	}

	/** Skip the timer and trigger the callback function immediately */
	public triggerNow(): this {
		this.clear()
		if (this.callback) this.callback(...this.args ?? [] as unknown as TArgs)
		if (this.interval) this.run()
		return this
	}

	/** Clear the backing timeout if any and set this as inactive */
	public clear(): this {
		this.isActive = false
		if (this.timeout) clearTimeout(this.timeout)
		this.timeout = null
		return this
	}
}

/** Representation of an Object of chunks of Buffers and subsequent chunks as children */
export type AccumulatorNode = {
	/** The current Buffer chunk */
	chunk: Buffer;
	/** The chunk that was added after the current one if any */
	next: AccumulatorNode | null;
}

/**
 * An optimized way to accumulate chunks of Buffers and merge them
 * once all of the chunks have been received
 */
export class BufferAccumulator {
	/** The first chunk that was received if there was no expected size */
	public first: AccumulatorNode | null = null
	/**
	 * The last received chunk if there was no expected size. Doesn't mean
	 * the last chunk that will ever be received
	 */
	public last: AccumulatorNode | null = null
	/** The current size of all of the chunks' Buffer bytes received so far */
	public size = 0

	private readonly _allocated: Buffer | null = null

	/**
	 * @param expecting The expected byte size of the final Buffer. If the final Buffer size is known ahead of time,
	 * it's better to pass this so that the chunks' contents are added directly to a pre allocated Buffer and skip
	 * the recursive concatination if it was of an unknown size
	 */
	public constructor(public readonly expecting: number | null = null) {
		if (expecting) this._allocated = Buffer.allocUnsafe(expecting)
	}

	/** Adds a chunk to this accumulator to be merged later */
	public add(buf: Buffer): void {
		if (this._allocated && this.expecting !== null) {
			if (this.size === this.expecting) return
			if ((this.size + buf.byteLength) > this.expecting) buf.subarray(0, this.expecting - this.size).copy(this._allocated, this.size)
			else buf.copy(this._allocated, this.size)
			this.size += buf.byteLength
			return
		}
		const obj = { chunk: buf, next: null }
		this.first ??= obj;
		if (this.last) this.last.next = obj
		this.last = obj
		this.size += buf.byteLength
	}

	/**
	 * Merge all of the received chunks together
	 */
	public concat(): Buffer | null {
		if (this._allocated) return this._allocated
		if (!this.first) return null
		if (!this.first.next) return this.first.chunk
		const r = Buffer.allocUnsafe(this.size)
		let written = 0
		let current: AccumulatorNode | null = this.first
		while (current) {
			current.chunk.copy(r, written)
			written += current.chunk.byteLength
			current = current.next
		}
		return r
	}
}

const dateDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const dateMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * Checks the passed string to ensure it's HTTP Date type compliant
 * @param date A string that is possibly using the HTTP Date type format
 * @returns If the supplied string follows the formatting of "Day, dy Mth year hr:mn:sc GMT" ex: "Tue, 29 Oct 2024 16:56:32 GMT"
 */
export function checkDateHeader(date?: string): boolean {
	if (!date) return false
	if (!dateDays.includes(date.slice(0, 3))) return false

	const [day, month, year, time, tz] = date.slice(5).split(spaceRegex)

	if (day?.length !== 2) return false
	if (!dateMonths.includes(month)) return false
	if (year?.length !== 4) return false // sucks for people past Year 9999, but the HTTP spec says 4 digit

	const [hour, minute, second] = time ? time.split(colonRegex) : []

	if (hour?.length !== 2) return false
	if (minute?.length !== 2) return false
	if (second?.length !== 2) return false
	if (tz !== "GMT") return false

	return true
}

/**
 * Get a random element from an array.
 */
export function arrayRandom<T>(array: Array<T>): T {
	const index = Math.floor(Math.random() * array.length)
	return array[index]
}

/**
 * Shuffle an array in place. https://stackoverflow.com/a/12646864
 */
export function arrayShuffle<T extends Array<unknown>>(array: T): T {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]]
	}
	return array
}

/**
 * Takes an Array table and converts it into an Array of rows padded to a human readable table with distinct columns
 * @param rows The first depth of the Array is all of the rows. The second depth are the columns. Can include the column headers
 * @param align An array who's length is the same as the number of columns from the `rows` param which defines how each column should align itself between other columns
 * @param surround A function that surrounds each column with one or multiple characters. Accepts 1 param which is the index of the current element from the `rows` param
 * @param spacer The text in between columns. By default is the EN space (half a point size)
 * @returns An Array of the rows stringified as a humand readable table with the params specified. Can be joined with \n for raw text or how we use it is to take sections of
 * the Array to pagify them while displaying pages of info to avoid taking up a large chunk of the viewport
 */
export function tableifyRows(rows: Array<Array<string>>, align: Array<"left" | "right" | "none">, surround: (currentLine: number) => string = () => "", spacer = " "): Array<string> { // SC: en space
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
			if (align[j] === "left" || align[j] === "right") {
				line += surround(i)
				if (align[j] === "left") {
					const pad = " ​"
					const padding = pad.repeat(maxLength[j] - rows[i][j].length)
					line += rows[i][j] + padding
				} else if (align[j] === "right") {
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

/**
 * Display the first few rows of a list and fewer of the last rows while removing the middle of the data in order to fit within the `maxLength` param
 * @param rows An Array containing the text that would be displayed as a list
 * @param maxLength The max length the text can be when it's joined together while taking into account the `joinLength` param
 * @param joinLength The text length you intend on .join()ing the returned Array with to be taken into account with the `maxLength` param
 * @param middleString The text that will be used to substitute all of the rows that are discarded
 */
export function removeMiddleRows(rows: Array<string>, maxLength = 2000, joinLength = 1, middleString = "…"): Array<string> {
	let currentLength = 0
	let currentItems = 0
	const maxItems = 20
	/**
	 * Holds items for the left and right sides.
	 * Items should flow into the left faster than the right.
	 * At the end, the sides will be combined into the final list.
	 */
	const reconstruction = {
		left: [] as Array<string>,
		right: [] as Array<string>
	}
	let leftOffset = 0
	let rightOffset = 0
	const getNextDirection = () => rightOffset * 3 > leftOffset ? "left" : "right"
	while (currentItems < rows.length) {
		const direction = getNextDirection()
		let row: string
		if (direction === "left") row = rows[leftOffset++]
		else row = rows[rows.length - 1 - rightOffset++]
		if (currentItems >= maxItems || currentLength + row.length + joinLength + middleString.length > maxLength) {
			return reconstruction.left.concat([middleString], reconstruction.right.reverse())
		}
		reconstruction[direction].push(row)
		currentLength += row.length + joinLength
		currentItems++
	}
	return reconstruction.left.concat(reconstruction.right.reverse())
}

/**
 * Converts rows of text to be paginated so as to not take up the entire viewport
 * @param rows An Array containing the text that would be displayed as a list
 * @param maxLength The max length the text can be when it's joined together while taking into account the `joinLength` param
 * @param joinLength The text length you intend on .join()ing the returned Array with to be taken into account with the `maxLength` param
 * @param itemsPerPage The max amount of items that can be on a page regardless of if the `maxLength` param could allow for more
 * @param itemsPerPageTolerance How many extra rows past the `itemsPerPage` param could be allowed on the last page if the remaining total number of `rows` is
 * within this amount instead of adding another page
 */
export function createPages(rows: Array<string>, maxLength: number, joinLength: number, itemsPerPage: number, itemsPerPageTolerance: number): Array<Array<string>> {
	const pages = [] as Array<Array<string>>
	let currentPage = [] as Array<string>
	let currentPageLength = 0
	const currentPageMaxLength = maxLength
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if ((currentPage.length >= itemsPerPage && rows.length - i > itemsPerPageTolerance) || currentPageLength + row.length + joinLength > currentPageMaxLength) {
			pages.push(currentPage)
			currentPage = []
			currentPageLength = 0
		}
		currentPage.push(row)
		currentPageLength += row.length + 1
	}
	pages.push(currentPage)
	return pages
}

/**
 * Improved way to convert JS values into human readable text, awaiting reachable Promises backed by util.inspect
 * @param data The value to inspect
 * @param depth For Arrays or Objects, how deep the data should be displayed which can be useful for shortening massive Objects
 * @param returnRaw By default, the data is formatted and sliced to fit and look nice into a Discord message, but not helpful or pretty in
 * a repl, this determines if the returned string is formatted and truncated or not
 */
export async function stringify(data: unknown, depth = 0, returnRaw = false): Promise<string> {
	let result = ""
	if (data === void 0) result = "(undefined)"
	else if (data === null) result = "(null)"
	else if (typeof (data) === "function") result = "(function)"
	else if (typeof (data) === "string") result = `"${data}"`
	else if (typeof (data) === "number") result = data.toString()
	else if (typeof (data) === "bigint") result = `${data.toString()}n`
	else if (data instanceof Promise) return stringify(await data, depth, returnRaw)
	else if (data instanceof Error) {
		const errorObject: Record<string, any> = {}
		Object.entries(data).forEach(e => errorObject[e[0]] = e[1])
		result = `${data.stack}${returnRaw ? "\n" : "```\n```"}${await stringify(errorObject, depth, returnRaw)}`
	} else result = util.inspect(data, { depth: depth })

	if (result.length > 2000 && !returnRaw) result = `\`\`\`js\n${result.slice(0, 1990)}…\`\`\``
	return result
}

/**
 * Creates a progress bar
 * @param length The max length the text of the progress bar should be
 * @param value The current value out of the `max` param amount
 * @param max The max value the `current` param can be
 * @param innerText Text to display in the middle of the progress bar
 * @param barFragment What character(s) should be used to make the bar out of. If the `max` / `barFragment`.length isn't a whole number,
 * some of the last `barFragment` may be cut off
 */
export function progressBar(length: number, value: number, max: number, innerText?: string | undefined, barFragment = "="): string {
	innerText ??= "";
	const textPosition = Math.floor(length / 2) - Math.ceil(innerText.length / 2) + 1
	let result = ""

	for (let i = 1; i <= length; i += barFragment.length) {
		if (i >= textPosition && i < textPosition + innerText.length) result += innerText[i - textPosition]
		else if (value / max * length >= i) result += barFragment
		else result += " ​" // space + zwsp to prevent shrinking
	}

	return `​${result}`.slice(0, length) // zwsp + result
}

/**
 * Converts anything resolvable to a BigInt to a string with commas where they should go
 * (ex: 1000000 would yield "1,000,000" if the machine's locale is American English)
 */
export function numberComma(value: number | string | bigint): string {
	return BigInt(value).toLocaleString()
}

/**
 * Converts a string representing a WHOLE NUMBER to a bigint. The string may include commas/periods depending on locale formatting,
 * but doesn't check validity of the placement. Also doesn't convert scientific notation such as 1e5.
 *
 * Because of the fact that different locales write numbers differently, floats are not supported and those formatting characters will be stripped.
 * Also BigInt only represents integers so like... Lol. It's kinda in the name. Maybe BigFloat soon:tm:?
 * @returns parsed bigint or null of the supplied string would resolve to NaN. Number.NaN's type is a number and making the return type bigint | number
 * would get messy.
 */
export function parseBigInt(value: string): bigint | null {
	const numstr = value.replace(commaRegex, "").replace(dotRegex, "")
	if (!/^\d+$/.exec(numstr)) return null
	return BigInt(numstr)
}

/**
 * Converts a number to a string, showing an ending that would be how you'd pronounce the last portion of the number
 */
export function position(pos: number | bigint): string {
	let value = numberComma(pos)

	if (value.endsWith("1")) {
		if (value.slice(value.length - 2, value.length) === "11") value += "th"
		else value += "st"
	} else if (value.endsWith("2")) {
		if (value.slice(value.length - 2, value.length) === "12") value += "th"
		else value += "nd"
	} else if (value.endsWith("3")) {
		if (value.slice(value.length - 2, value.length) === "13") value += "th"
		else value += "rd"
	} else if (["0", "4", "5", "6", "7", "8", "9"].find(e => value.endsWith(e))) value += "th"

	return value
}

/**
 * Shorten potentially long numbers to their abbreviated, human readable forms. Currently only supports whole numbers
 * @param value The number to shorten
 * @param precision How many numbers of the mantissa to display
 * (defaults to 2, so a value of 1,200,000 would resolve as 1.20m if the machine's locale is American English)
 */
export function abbreviateNumber(value: number | string | bigint, precision = 2): string {
	const converted = typeof value === "bigint" ? value : parseBigInt(value.toString())
	if (converted === null) throw new TypeError(`Value of ${value} cannot be parsed as a bigint`)

	if (converted >= BigInt(10000)) { // values less than 10,000 don't have to be shortened for us. If you're implementing this elsewhere, feel free to remove this.
		const identifiers = ["", "k", "m", "b", "t", "qua", "qui", "sex", "sep"]
		const split = converted.toLocaleString().split(",")
		const index = split.length - 1

		if (index > identifiers.length - 1) return `${(BigInt(split[0]) * (BigInt(1000) * BigInt(index - identifiers.length - 1))).toLocaleString()} ${identifiers.slice(-1)[0]}` // Because BigInts can be HUGE
		else return `${Number(split[0])}${split[1] && Number(split[1]) !== 0 ? "." : ""}${split[1] && Number(split[1]) !== 0 ? split[1].slice(0, precision) : ""}${identifiers[index]}`
	}

	return converted.toLocaleString()
}

/**
 * Convert a Date to a UTC string, but limiting the precision of the time to just the hours and in 12h format
 */
export function upcomingDate(date: Date): string {
	const currentHours = date.getUTCHours()
	let textHours = ""

	if (currentHours < 12) textHours += `${currentHours} AM`
	else textHours = `${currentHours - 12} PM`

	return `${date.toUTCString().split(" ").slice(0, 4).join(" ")} at ${textHours} UTC`
}

/**
 * Gets the local time of the supplied date in the format of hh`?`mm`?`ss where the `?` is the value of the `separator` param
 * @param when Anything that can be resolved by the DateConstructor. If undefined, defaults to Date.now()
 * @param seperator Any character(s) to go in between the parts of the time fragments (defaults to an empty string)
 */
export function getSixTime(when: Date | string | number | undefined, seperator: string): string {
	const d = new Date(when ?? Date.now())
	if (!seperator) seperator = ""
	return d.getHours().toString().padStart(2, "0") + seperator + d.getMinutes().toString().padStart(2, "0") + seperator + d.getSeconds().toString().padStart(2, "0")
}

/**
 * Shortens a number in ms that would be a time value
 * (ex: a value of 1000 * 60 * 60 * 24 would resolve as "1d")
 * @param number The time to convert in ms
 */
export function shortTime(number: number): string {
	if (isNaN(number)) throw new TypeError("Input provided is NaN")
	number = Math.floor(number)

	const days = Math.floor(number / 1000 / 60 / 60 / 24)
	number -= days * 1000 * 60 * 60 * 24
	const hours = Math.floor(number / 1000 / 60 / 60)
	number -= hours * 1000 * 60 * 60
	const mins = Math.floor(number / 1000 / 60)
	number -= mins * 1000 * 60
	const secs = Math.floor(number / 1000)

	let timestr = ""
	if (days > 0) timestr += `${days}d `
	if (hours > 0) timestr += `${hours}h `
	if (mins > 0) timestr += `${mins}m `
	if (secs > 0) timestr += `${secs}s`
	if (!timestr) timestr = `0s`

	return timestr
}

/**
 * Converts a time string a user might input to a number representing the time
 * @param input In the format of, ex: 1w 2d 3h 4m 1s
 * @returns The parsed time or null if no input or if any of the frames (parts of the time str) fail validation
 */
export function parseDuration(input?: string): number | null {
	if (!input) return null
	const individual = input.split(durationInputSplitterRegex)
	let totalTime = 0

	for (const frame of individual) {
		const test = durationFrameRegex.exec(frame)
		if (test === null) return null
		if (!test[1]) return null
		const [duration, identifier] = [test[1], test[2]]
		const num = Number(parseBigInt(duration))
		if (!num || isNaN(num)) return null
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

/**
 * Formats a number of seconds to short time (ex: 01:20:05), but the hours and minutes
 * portion of the formatting are optional if there isn't enough time where they'd not show as 0s
 */
export function prettySeconds(seconds: number): string {
	let minutes = Math.floor(seconds / 60)
	seconds = seconds % 60
	const hours = Math.floor(minutes / 60)
	minutes = minutes % 60

	const output = [] as Array<number | string>
	if (hours) {
		output.push(hours)
		output.push(minutes.toString().padStart(2, "0"))
	} else output.push(minutes)

	output.push(seconds.toString().padStart(2, "0"))

	return output.join(":")
}

/**
 * Gets and Amanda lang object from a lang id
 */
export function getLang(id: string): Lang {
	const code = id.toLowerCase().replace(dashRegex, "_")
	return language[code as keyof typeof language] ?? language.en_us
}

// TypeScript complains about string.prototype.substr being deprecated and only being available for browser compatability
// this polyfill has been tested to be compliant with the real substr with some of its quirks like not actually returning a length
// of the specified length
/**
 * Gets a substring beginning at the specified location and having the specified length.
 * @param text this string
 * @param from The starting position of the desired substring. The index of the first character in the string is zero.
 * @param length The number of characters to include in the returned substring.
 */
export function substr(text: string, from: number, length?: number): string {
	if (length === 0) return ""
	if (!length || (from + length) <= text.length) return text.slice(from, length ? from + length : void 0)
	return text.repeat(Math.ceil(length / (from + text.length))).slice(from, from + length)
}

/**
 * Get a user from Discord by id, using cache where available
 * @param id The Discord id of the user to get
 * @param snow The SnowTransfer instance to initiate the requests
 * @param client The client object to use its user object if the id is the client user's id
 * @param force If the cache should be skipped when deciding if the user will be fetched from Discord
 */
export async function getUser(id: string, snow: SnowTransfer, client?: { user: APIUser } | undefined, force = false): Promise<APIUser & { amanda_expiry: string } | null> {
	const currently = new Date()
	currently.setDate(currently.getDate() + 7)
	if (id === client?.user.id && !force) return { amanda_expiry: currently.toUTCString(), ...client.user }
	if (confprovider.config.redis_enabled && !force) {
		const cached = await redis.GET<APIUser & { amanda_expiry: string }>("user", id)
		if (cached) {
			const expired = new Date(cached.amanda_expiry).getTime() >= currently.getTime()
			if (!expired) return cached
		}
	}
	const fetched = await snow.user.getUser(id).catch(() => null)
	if (fetched && confprovider.config.redis_enabled) updateUser(fetched)
	if (!fetched) return null
	return { amanda_expiry: currently.toUTCString(), ...fetched }
}

/**
 * Updates the data of a user in the cache if available
 */
export function updateUser(user?: APIUser): void {
	if (user && confprovider.config.redis_enabled) {
		const currently = new Date()
		currently.setDate(currently.getDate() + 7)
		redis.SET("user", user.id, { amanda_expiry: currently.toUTCString(), ...user }, "user")
	}
}

/**
 * Gets a url to a png or gif of a user's avatar, respecting guild overrides if available
 * @param user The user Object
 * @param member The member Object if in a guild
 * @param guildID The id of the guild if in a guild
 * @param dynamic If the user has an animated avatar, use that instead of a png
 */
export function displayAvatarURL(user: APIUser, member?: APIGuildMember | APIInteractionDataResolvedGuildMember | APIInteractionGuildMember | null, guildID?: string | null, dynamic?: boolean): string {
	const avatar = member?.avatar ?? user.avatar
	const isMemberAvatar = !!member?.avatar
	const useDefault = isMemberAvatar && !guildID

	if (!avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) >> BigInt(22)) % 5}.png`
	else if (isMemberAvatar && !useDefault) return `https://cdn.discordapp.com/guilds/${guildID}/users/${user.id}/avatars/${avatar}.${dynamic && avatar.startsWith("a_") ? "gif" : "png"}`

	return `https://cdn.discordapp.com/avatars/${user.id}/${avatar}.${dynamic && avatar.startsWith("a_") ? "gif" : "png"}`
}

/** Partial representation of `@amanda/commands` ChatInputCommand */
type PartialChatInputCommand = {
	application_id: string;
	token: string;
}

/**
 * Create a paginated table UI in a Discord text channel
 * @param cmd The `@amanda/commands` ChatInputCommand
 * @param lang The Amanda lang Object of the user or the guild the command was issued in
 * @param title The titles of the columns of the table
 * @param rows The first depth of the Array is all of the rows. The second depth are the columns
 * @param align An array who's length is the same as the number of columns from the `rows` param which defines how each column should align itself between other columns
 * @param maxLength The max length the text can be when it's joined together
 * @param snow The SnowTransfer instance to initiate the requests
 */
export function createPagination(cmd: PartialChatInputCommand, lang: Lang, title: Array<string>, rows: Array<Array<string>>, align: Array<"left" | "right" | "none">, maxLength: number, snow: SnowTransfer): void {
	let alignedRows = tableifyRows([title].concat(rows), align, () => "`")
	const formattedTitle = alignedRows[0].replace(alignedRowsRegex, sub => `__**\`${sub}\`**__`)
	alignedRows = alignedRows.slice(1)
	const pages = createPages(alignedRows, maxLength - formattedTitle.length - 1, 1, 16, 4)
	paginate(pages.length, (page, component) => {
		const extra: Array<APIComponentInContainer> = component
			? [{ type: 1, components: [component.component] }]
			: []
		return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			flags: MessageFlags.IsComponentsV2,
			components: [
				{
					type: ComponentType.Container,
					components: [
						{
							type: ComponentType.TextDisplay,
							content: `${formattedTitle}\n${pages[page].join("\n")}`
						},
						{
							type: ComponentType.Separator
						},
						{
							type: ComponentType.TextDisplay,
							content: langReplace(lang.GLOBAL.PAGE_X_OF_Y, { "current": page + 1, "total": pages.length })
						},
						...extra
					]
				}
			]
		})
	})
}

/**
 * Create a callback for user page selection returning the page number and a Discord select menu component if there are more than 1 page
 * @param pageCount How many pages there are
 * @param callback The callback function for the root to know what page the user selected and the component if mroe than 1 page
 */
export function paginate(pageCount: number, callback: (page: number, component: InstanceType<typeof BetterComponent> | null) => unknown): void {
	let page = 0
	if (pageCount > 1) {
		const options = Array(Math.min(pageCount, 25)).fill(null).map((_, i) => ({ label: `Page ${i + 1}`, value: String(i), default: false }))
		const component = new buttons.BetterComponent({
			type: 3,
			placeholder: "Select page",
			max_values: 1,
			min_values: 1,
			options
		} as import("discord-api-types/v10").APISelectMenuComponent, { cluster: confprovider.config.cluster_id })

		const menuExpires = new BetterTimeout(() => component.destroy(), 60 * 1000).run()

		component.setCallback(interaction => {
			const select = interaction as import("discord-api-types/v10").APIMessageComponentSelectMenuInteraction
			page = Number(select.data.values[0] || 0)
			menuExpires.clear().run()
			callback(page, component)
		})

		callback(page, component)
	} else callback(page, null)
}

/**
 * Display a Discord user's global name or username + discrim if they haven't been converted yet
 */
export function userString(user: APIUser): string {
	return user.global_name ?? `${user.username}#${user.discriminator}`
}

/**
 * I honestly can't remember why I wrote this or how it works.
 * I don't have the brain capacity to document this as its unused
 */
export function getMSUntilStepped(timeAsMS: number, offset?: number): number {
	const remaining = timeAsMS - (Date.now() % timeAsMS)
	return (timeAsMS * (offset ?? 0)) + remaining
}

/** The Discord system profile. Yes, it's real */
export const DiscordsProfile = {
	id: "643945264868098049",
	username: "discord",
	avatar: "c6a249645d46209f337279cd2ca998c7",
	discriminator: "0000",
	public_flags: 1,
	flags: 1,
	bot: true,
	system: true,
	banner: null,
	accent_color: null,
	global_name: "Discord",
	avatar_decoration_data: null,
	collectibles: null,
	display_name_styles: null,
	banner_color: null,
	clan: null,
	primary_guild: null
} as APIUser

/** Indexed strings of months for Date.getMonth() */
export const dateMonthMap = {
	0: "January",
	1: "February",
	2: "March",
	3: "April",
	4: "May",
	5: "June",
	6: "July",
	7: "August",
	8: "September",
	9: "October",
	10: "November",
	11: "December"
}

/** Converts a number of bytes to a string of megabytes */
export function bToMB(number: number): string {
	return `${((number / 1024) / 1024).toFixed(2)}MB`
}

/**
 * Default handler for when commands raise an exception, logging it to stderr and sending to Amanda's error log channel
 * @param command The command interaction
 * @param snow The SnowTransfer instance to initiate the requests
 * @param e The error that occurred
 */
export async function defaultCommandManagerErrorHandler(command: APIChatInputApplicationCommandInteraction, snow: SnowTransfer, e: any) {
	console.error(e)
	const userLang = getLang(command.locale)
	snow.interaction.createFollowupMessage(command.application_id, command.token, { content: langReplace(userLang.GLOBAL.COMMAND_ERROR, { name: command.data.name, server: confprovider.config.invite_link_for_help }) }).catch(() => void 0)
	if (confprovider.config.error_log_channel_id?.length) {
		const user = (command.member?.user ?? command.user!)

		const undef = "undefined"
		const details = [
			["Tree", confprovider.config.cluster_id],
			["Guild ID", command.guild_id ?? undef],
			["Text Channel", `${command.channel.name ?? undef} (${command.channel.id})`],
			["User ID", user.id],
			["User Tag", userString(user)]
		]
		const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
		const detailsString = details.map(row =>
			`\`${row[0]}${" ​".repeat(maxLength - row?.[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
		).join("\n")

		snow.channel.createMessage(confprovider.config.error_log_channel_id, {
			flags: MessageFlags.IsComponentsV2,
			components: [
				{
					type: ComponentType.Container,
					accent_color: 0xdd2d2d,
					components: [
						{
							type: ComponentType.TextDisplay,
							content: "Command error occurred."
						},
						{
							type: ComponentType.TextDisplay,
							content: detailsString
						},
						{
							type: ComponentType.Separator
						},
						{
							type: ComponentType.TextDisplay,
							content: util.inspect(e, false, 5, false)
						}
					]
				}
			]
		})
	}
}
