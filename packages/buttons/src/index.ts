/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
	APIMessageComponentInteractionData,
	APIUser,
	APIInteraction,
	APIButtonComponentWithCustomId,
	APISelectMenuComponent,
	APIMessageComponentInteraction
} from "discord-api-types/v10"

let handlers: {
	[route: string]: (button: APIMessageComponentInteractionData, user: APIUser) => unknown
} = {}
let routeHandler: (button: APIMessageComponentInteractionData, user: APIUser) => string = (button): string => button.custom_id


const components = new Map<string, typeof cc.BetterComponent["prototype"]>()
// This string is important to create truly random IDs across restarts as the sequencing may produce an identical ID.
const randomString = Math.random().toString(36).substring(7)
let idSequence = 0
const bcAcceptableTypes = [2, 3, 5, 6, 7, 8] as const

const isObject = <T>(item: T): T extends Record<any, any> ? true : false => {
	return (typeof item === "object" && !Array.isArray(item) && item !== null) as T extends Record<any, any> ? true : false
}

const delimiter = "�"
const forbiddenKeys = ["__proto__", "prototype"]

const cc = {
	setHandlers(router: (button: APIMessageComponentInteractionData, user: APIUser) => string, info: {
		[route: string]: (button: APIMessageComponentInteractionData, user: APIUser) => unknown
	}) {
		routeHandler = router
		handlers = info
	},

	/**
	 * A method to encode custom data into the custom_id while being very space efficient.
	 * Keys or values cannot include the null (�) character and keys cannot be \_\_proto\_\_ or prototype
	 */
	encode(info: Record<string, any> | Array<any>): string {
		let rt = ""

		const push = (item: any) => {
			if (isObject(item)) rt += `{${cc.encode(item)}}` // obj
			else if (Array.isArray(item)) {
				// array
				const mapped = item.map((i, ind, arr) => {
					return isObject(i)
						? `{${cc.encode(i)}}`
						// [...null, 1000] => [...n�1000] Appends delimiter if isn't last element
						: `${cc.encode(i)}${ind !== arr.length - 1 ? delimiter : ""}`
				}).join("")
				rt += `[${mapped}]`
			} else if (item === null) rt += "n" // nil
			else if (typeof item === "bigint") rt += `b${item}` // bigint
			else if (typeof item === "undefined") rt += "v" // void
			else if (typeof item === "string") rt += `"${item}` // strings
			else if (typeof item === "boolean") rt += item ? "t" : "f" // booleans
			else if (typeof item === "number") rt += String(item)
			else throw new Error(`Don't know how to encode ${typeof item}: ${require("util").inspect(item)}`)
		}

		if (!isObject(info)) push(info)
		else {
			const keys = Object.keys(info)
			for (let index = 0; index < keys.length; index++) {
				const key = keys[index]
				if (forbiddenKeys.includes(key)) continue
				rt += `${key}:`
				push(info[key])

				// They have their own endings, so space can be saved
				if ((index !== keys.length - 1) && !isObject(info[key]) && !Array.isArray(info[key])) rt += delimiter
			}
		}

		return rt
	},

	decode<T extends "object" | "array", R extends T extends "object" ? Record<string, any> : Array<any>>(str: string, type: T = "object" as T): R {
		const rt = type === "object" ? {} as R : [] as unknown as R
		let text = str

		while (text.length) {
			let key = ""
			let ignore = false

			if (type === "object") {
				const firstColon = text.indexOf(":")
				key = text.slice(0, firstColon)
				if (forbiddenKeys.includes(key)) ignore = true
				text = text.slice(firstColon + 1)
			}

			const nextDelimiter = text.indexOf(delimiter)
			const endToUse = nextDelimiter === -1 ? text.length : nextDelimiter

			let actualValue: unknown = void 0
			if (text[0] === "\"") {
				actualValue = text.slice(1, endToUse)
				text = text.slice(endToUse + 1)
			} else if (text[0] === "{") {
				const closingIndex = findClosing(text, 0, "}")
				actualValue = cc.decode(text.slice(1, closingIndex))
				text = text.slice(closingIndex + 1)
			} else if (text[0] === "[") {
				const closingIndex = findClosing(text, 0, "]")
				actualValue = cc.decode(text.slice(1, closingIndex), "array")
				text = text.slice(closingIndex + 1)
			} else if (text[0] === "t") {
				actualValue = true
				text = text.slice(endToUse + 1)
			} else if (text[0] === "f") {
				actualValue = false
				text = text.slice(endToUse + 1)
			} else if (text[0] === "v") {
				actualValue = void 0
				text = text.slice(endToUse + 1)
			} else if (text[0] === "n") {
				actualValue = null
				text = text.slice(endToUse + 1)
			} else if (text[0] === "b") {
				actualValue = BigInt(text.slice(1, endToUse))
				text = text.slice(endToUse + 1)
			} else {
				actualValue = Number(text.slice(0, endToUse))
				text = text.slice(endToUse + 1)
			}

			if (ignore) continue
			if (type === "object") rt[key] = actualValue
			else rt.push(actualValue)
		}

		return rt
	},

	handle(interaction: APIInteraction): void {
		if (interaction.type !== 3 || !interaction.data) return

		if (bcAcceptableTypes.includes(interaction.data.component_type)) {
			const decoded = cc.decode(interaction.data.custom_id, "object")
			const btn = components.get(decoded?.mid ?? interaction.data.custom_id)
			btn?.callback?.(interaction, btn)
			return
		}

		const route = routeHandler(interaction.data, interaction.user ? interaction.user : interaction.member!.user)
		if (handlers[route]) handlers[route](interaction.data, interaction.user ? interaction.user : interaction.member!.user)
	},

	BetterComponent: class BetterComponent {
		public callback: ((interaction: APIMessageComponentInteraction, component: BetterComponent) => unknown) | null = null
		public id: string
		public component: APIButtonComponentWithCustomId | APISelectMenuComponent

		public constructor(
			public info: Omit<APIButtonComponentWithCustomId | APISelectMenuComponent, "custom_id">,
			extraEncodedInfo: Record<string, any>
		) {
			this.id = BetterComponent.#nextID
			components.set(this.id, this)
			this.component = Object.assign({ custom_id: cc.encode({ mid: this.id, ...(extraEncodedInfo || {}) }) }, this.info) as BetterComponent["component"]
		}

		static get #nextID(): string {
			return `menu-${randomString}-${idSequence++}`
		}

		public setCallback(fn: (interaction: APIMessageComponentInteraction, component: BetterComponent) => unknown): this {
			this.callback = fn
			return this
		}

		public destroy(): this {
			components.delete(this.id)
			return this
		}
	}
}

export = cc

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
