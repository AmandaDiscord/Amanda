import encoding = require("@amanda/encoding")

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

const cc = {
	setHandlers(router: (button: APIMessageComponentInteractionData, user: APIUser) => string, info: {
		[route: string]: (button: APIMessageComponentInteractionData, user: APIUser) => unknown
	}) {
		routeHandler = router
		handlers = info
	},

	handle(interaction: APIInteraction): void {
		if (interaction.type !== 3 || !interaction.data) return

		if (bcAcceptableTypes.includes(interaction.data.component_type)) {
			const decoded = encoding.decode(interaction.data.custom_id)
			const btn = components.get(decoded?.mid ?? interaction.data.custom_id)
			btn?.callback?.(interaction, btn)
			return
		}

		const route = routeHandler(interaction.data, interaction.user ? interaction.user : interaction.member!.user)
		if (handlers[route]) handlers[route](interaction.data, interaction.user ? interaction.user : interaction.member!.user)
	},

	BetterComponent: class BetterComponent {
		public callback: ((interaction: APIMessageComponentInteraction, component: BetterComponent) => unknown) | null = null
		public id: string = BetterComponent.#nextID
		public component: APIButtonComponentWithCustomId | APISelectMenuComponent

		public constructor(
			public info: Omit<APIButtonComponentWithCustomId | APISelectMenuComponent, "custom_id">,
			extraEncodedInfo: Record<string, any>
		) {
			components.set(this.id, this)
			this.component = { custom_id: encoding.encode({ mid: this.id, ...(extraEncodedInfo || {}) }), ...this.info } as BetterComponent["component"]
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
