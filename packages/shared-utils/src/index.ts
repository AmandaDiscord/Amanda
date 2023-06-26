/* eslint-disable no-empty-function */

import util = require("util")

import language = require("@amanda/lang")
import langReplace = require("@amanda/lang/replace")
import buttons = require("@amanda/buttons")
import confprovider = require("@amanda/config")

import type { APIUser } from "discord-api-types/v10"
import type { SnowTransfer } from "snowtransfer"
import type { Lang } from "@amanda/lang"

const commaRegex = /,/g
const spaceRegex = / /g
const colonRegex = /:/g
const dashRegex = /-/g
const durationFrameRegex = /(\d+) ?(\w+)?/
const durationInputSplitterRegex = /(?! [^\d]+) /g
const alignedRowsRegex = /`.+?`/g

export class AsyncValueCache<T> {
	public lifetimeTimeout: NodeJS.Timeout | null = null
	public promise: Promise<T> | null = null
	public cache: T | null = null

	public constructor(public getter: () => Promise<T>, public lifetime: number | undefined = undefined) {}

	public clear(): void {
		if (this.lifetimeTimeout) clearTimeout(this.lifetimeTimeout)
		this.cache = null
	}

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

export class BetterTimeout {
	public callback: (() => unknown) | null = null
	public delay: number | null = null
	public isActive = false
	public timeout: NodeJS.Timeout | null = null

	public setCallback(callback: () => unknown): this {
		this.clear()
		this.callback = callback
		return this
	}

	public setDelay(delay: number): this {
		this.clear()
		this.delay = delay
		return this
	}

	public run(): this {
		this.clear()
		if (this.callback && this.delay) {
			this.isActive = true
			this.timeout = setTimeout(() => this.callback?.(), this.delay)
		}
		return this
	}

	public triggerNow(): this {
		this.clear()
		if (this.callback) this.callback()
		return this
	}

	public clear(): this {
		this.isActive = false
		if (this.timeout) clearTimeout(this.timeout)
		return this
	}
}

export class FrequencyUpdater {
	public timeout: NodeJS.Timeout | null = null
	public interval: NodeJS.Timeout | null = null

	public constructor(public callback: () => unknown) {}

	public start(frequency: number, trigger: boolean, delay = frequency): void {
		this.stop(false)
		if (trigger) this.callback()
		this.timeout = setTimeout(() => {
			this.callback()
			this.interval = setInterval(() => {
				this.callback()
			}, frequency)
			this.timeout = null
		}, delay)
	}

	public stop(trigger = false): void {
		if (this.timeout) clearTimeout(this.timeout)
		if (this.interval) clearInterval(this.interval)
		this.timeout = null
		this.interval = null
		if (trigger) this.callback()
	}
}

export type AccumulatorNode = {
	chunk: Buffer;
	next: AccumulatorNode | null;
}

export class BufferAccumulator {
	public first: AccumulatorNode | null = null
	public last: AccumulatorNode | null = null
	public size = 0

	private _allocated: Buffer | null = null
	private _streamed: number | null = null

	public constructor(public expecting: number | null = null) {
		if (expecting) {
			this._allocated = Buffer.allocUnsafe(expecting)
			this._streamed = 0
		}
	}

	public add(buf: Buffer): void {
		if (this._allocated && this._streamed !== null && this.expecting !== null) {
			if (this._streamed === this.expecting) return
			if ((this._streamed + buf.byteLength) > this.expecting) buf.subarray(0, this.expecting - this._streamed).copy(this._allocated, this._streamed)
			else buf.copy(this._allocated, this._streamed)
			return
		}
		const obj = { chunk: buf, next: null }
		if (!this.first) this.first = obj
		if (this.last) this.last.next = obj
		this.last = obj
		this.size += buf.byteLength
	}

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

export function removeMiddleRows(rows: Array<string>, maxLength = 2000, joinLength = 1, middleString = "…"): Array<string> {
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

export function createPages(rows: Array<string>, maxLength: number, itemsPerPage: number, itemsPerPageTolerance: number): Array<Array<string>> {
	const pages = [] as Array<Array<string>>
	let currentPage = [] as Array<string>
	let currentPageLength = 0
	const currentPageMaxLength = maxLength
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if ((currentPage.length >= itemsPerPage && rows.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
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

export async function stringify(data: unknown, depth = 0, returnRaw = false): Promise<string> {
	let result = ""
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

export function progressBar(length: number, value: number, max: number, text?: string): string {
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
export function numberComma(value: number | string | bigint): string {
	return BigInt(value).toLocaleString()
}

/**
 * Converts a string to a bigint. The string may include commas.
 */
export function parseBigInt(value: string): bigint | null {
	const numstr = value.replace(commaRegex, "")
	if (!/^\d+$/.exec(numstr)) return null
	return BigInt(numstr)
}

export function position(pos: number | bigint): string {
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

export function abbreviateNumber(value: number | string | bigint, precision = 2): string {
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

export function upcomingDate(date: Date): string {
	const currentHours = date.getUTCHours()
	let textHours = ""

	if (currentHours < 12) textHours += `${currentHours} AM`
	else textHours = `${currentHours - 12} PM`

	return `${date.toUTCString().split(" ").slice(0, 4).join(" ")} at ${textHours} UTC`
}

export function getSixTime(when: Date | string, seperator: string): string {
	const d = new Date(when || Date.now())
	if (!seperator) seperator = ""
	return d.getHours().toString().padStart(2, "0") + seperator + d.getMinutes().toString().padStart(2, "0") + seperator + d.getSeconds().toString().padStart(2, "0")
}

const defaultPrecision = ["d", "h", "m", "s"] as const
export function shortTime(number: number, scale: "ms" | "sec", precision: ReadonlyArray<"d" | "h" | "m" | "s"> = defaultPrecision): string {
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

export function parseDuration(input?: string): number | null {
	if (!input) return null
	const individual = input.split(durationInputSplitterRegex)
	let totalTime = 0

	for (const frame of individual) {
		const test = durationFrameRegex.exec(frame)
		if (test == null) return null
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

export function getLang(id: string): Lang {
	const code = id.toLowerCase().replace(dashRegex, "_")
	return language[code] || language.en_us
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

export async function getUser(id: string, snow: SnowTransfer, client?: { user: APIUser }): Promise<APIUser> {
	const sql: typeof import("@amanda/sql/src/index") = require("@amanda/sql")
	if (id === client?.user.id) return client.user
	if (confprovider.config.db_enabled) {
		const cached = await sql.orm.get("users", { id: id })
		if (cached) return convertCachedUser(cached)
	}
	const fetched = await snow.user.getUser(id).catch(() => null)
	if (fetched && confprovider.config.db_enabled) {
		sql.orm.upsert("users", {
			id,
			tag: `${fetched.username}#${fetched.discriminator ?? 0}`,
			avatar: fetched.avatar,
			bot: fetched.bot ? 1 : 0,
			added_by: confprovider.config.cluster_id
		})
	}
	return fetched
}

export function convertCachedUser(user: { id: string; tag: string; bot: number; avatar: string | null; }): APIUser {
	const split = user.tag.split("#")
	return Object.assign(user, {
		username: split.slice(0, split.length - 1).join("#"),
		discriminator: split[split.length - 1],
		bot: !!user.bot,
		avatar: typeof user.avatar === "string" && user.avatar.length === 0 ? null : user.avatar
	})
}

export function displayAvatarURL(user: APIUser, dynamic?: boolean): string {
	if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) >> BigInt(22)) % 5}.png`
	return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${dynamic && user.avatar.startsWith("a_") ? "gif" : "png"}`
}

export function createPagination(cmd: import("@amanda/commands/src/index").ChatInputCommand, lang: Lang, title: Array<string>, rows: Array<Array<string>>, align: Array<"left" | "right" | "none">, maxLength: number, snow: SnowTransfer): void {
	let alignedRows = tableifyRows([title].concat(rows), align, () => "`")
	const formattedTitle = alignedRows[0].replace(alignedRowsRegex, sub => `__**\`${sub}\`**__`)
	alignedRows = alignedRows.slice(1)
	const pages = createPages(alignedRows, maxLength - formattedTitle.length - 1, 16, 4)
	paginate(pages.length, (page, component) => {
		const data: Parameters<import("snowtransfer").InteractionMethods["editOriginalInteractionResponse"]>["2"] = {
			embeds: [
				{
					color: confprovider.config.standard_embed_color,
					description: `${formattedTitle}\n${pages[page].join("\n")}`,
					footer: {
						text: langReplace(lang.GLOBAL.PAGE_X_OF_Y, { "current": page + 1, "total": pages.length })
					}
				}
			]
		}
		if (component) data.components = [{ type: 1, components: [component.component] }]
		return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, data)
	})
}

export function paginate(pageCount: number, callback: (page: number, component: InstanceType<typeof buttons.BetterComponent> | null) => unknown): void {
	let page = 0
	if (pageCount > 1) {
		let menuExpires: NodeJS.Timeout
		const options = Array(pageCount).fill(null).map((_, i) => ({ label: `Page ${i + 1}`, value: String(i), default: false }))
		const component = new buttons.BetterComponent({
			type: 3,
			placeholder: "Select page",
			max_values: 1,
			min_values: 1,
			options
		} as import("discord-api-types/v10").APISelectMenuComponent, { h: "page" })

		component.setCallback(interaction => {
			const select = interaction as import("discord-api-types/v10").APIMessageComponentSelectMenuInteraction
			page = Number(select.data.values[0] || 0)
			callback(page, component)
		})

		// eslint-disable-next-line no-inner-declarations
		function makeTimeout() {
			clearTimeout(menuExpires)
			menuExpires = setTimeout(() => {
				component.destroy()
			}, 10 * 60 * 1000)
		}
		makeTimeout()
		callback(page, component)
	} else callback(page, null)
}
