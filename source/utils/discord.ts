import Jimp from "jimp"
import { BetterComponent } from "callback-components"

import passthrough from "../passthrough"
const { client, sync, config, constants } = passthrough

const orm = sync.require("./orm") as typeof import("./orm")
const arr = sync.require("./array") as typeof import("./array")
const language = sync.require("./language") as typeof import("./language")

export async function getUser(id: string) {
	if (id === client.user?.id) return client.user
	if (config.db_enabled) {
		const cached = await orm.db.get("users", { id: id })
		if (cached) return convertCachedUser(cached)
	}
	const fetched = await client.snow.user.getUser(id).catch(() => null)
	if (fetched && config.db_enabled) orm.db.upsert("users", { id: id, tag: `${fetched.username}#${fetched.discriminator}`, avatar: fetched.avatar, bot: fetched.bot ? 1 : 0, added_by: config.cluster_id })
	return fetched
}

export function convertCachedUser(user: import("../types").InferModelDef<typeof orm.db["tables"]["users"]>) {
	const split = user.tag.split("#")
	Object.assign(user, { username: split.slice(0, split.length - 1).join("#"), discriminator: split[split.length - 1], bot: !!user.bot, avatar: typeof user.avatar === "string" && user.avatar.length === 0 ? null : user.avatar })
	return user as unknown as import("discord-typings").User
}

export async function getAvatarJimp(user: import("discord-typings").User) {
	let newURL = displayAvatarURL(user, true)
	const head = await fetch(newURL, { method: "HEAD" }).catch(() => void 0)
	if (!head || head.status !== 200) newURL = `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator) % 5}.png`
	return Jimp.read(newURL)
}

export function displayAvatarURL(user: import("discord-typings").User, dynamic?: boolean) {
	if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator) % 5}.png`
	return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${dynamic && user.avatar.startsWith("a_") ? "gif" : "png"}`
}

const reg = /`.+?`/g

export function createPagination(cmd: import("../modules/Command"), lang: import("@amanda/lang").Lang, title: Array<string>, rows: Array<Array<string>>, align: Array<"left" | "right" | "none">, maxLength: number) {
	let alignedRows = arr.tableifyRows([title].concat(rows), align, () => "`")
	const formattedTitle = alignedRows[0].replace(reg, sub => `__**\`${sub}\`**__`)
	alignedRows = alignedRows.slice(1)
	const pages = arr.createPages(alignedRows, maxLength - formattedTitle.length - 1, 16, 4)
	paginate(pages.length, (page, component) => {
		const data: import("snowtransfer").WebhookEditMessageData = {
			embeds: [
				{
					color: constants.standard_embed_color,
					description: `${formattedTitle}\n${pages[page].join("\n")}`,
					footer: {
						text: language.replace(lang.GLOBAL.PAGE_X_OF_Y, { "current": page + 1, "total": pages.length })
					}
				}
			]
		}
		if (component) data.components = [{ type: 1, components: [component.toComponent()] }]
		return client.snow.interaction.editOriginalInteractionResponse(client.application.id, cmd.token, data)
	})
}

export function paginate(pageCount: number, callback: (page: number, component: BetterComponent | null) => unknown) {
	let page = 0
	if (pageCount > 1) {
		let menuExpires: NodeJS.Timeout
		const options = Array(pageCount).fill(null).map((_, i) => ({ label: `Page ${i + 1}`, value: String(i), default: false }))
		const component = new BetterComponent({
			type: 3,
			placeholder: "Select page",
			max_values: 1,
			min_values: 1,
			options
		} as import("discord-typings").SelectMenu)

		component.setCallback(interaction => {
			client.snow.interaction.createInteractionResponse(interaction.id, interaction.token, { type: 6 })
			page = Number(interaction.data?.values?.[0] || 0)
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
	return null
}

export default exports as typeof import("./discord")
