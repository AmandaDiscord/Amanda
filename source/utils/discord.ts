import Jimp from "jimp"
import { BetterComponent } from "callback-components"

import passthrough from "../passthrough"
const { client, sync, config, constants } = passthrough

const orm = sync.require("./orm") as typeof import("./orm")
const arr = sync.require("./array") as typeof import("./array")

export async function getUser(id: string) {
	if (id === client.user?.id) return client.user
	const cached = await orm.db.get("users", { id: id })
	if (cached) return convertCachedUser(cached)
	const fetched = await client.snow.user.getUser(id).catch(() => null)
	if (fetched) orm.db.upsert("users", { id: id, tag: `${fetched.username}#${fetched.discriminator}`, avatar: fetched.avatar, bot: fetched.bot ? 1 : 0, added_by: config.cluster_id })
	return fetched
}

export function convertCachedUser(user: import("../types").InferModelDef<typeof orm.db["tables"]["users"]>) {
	const split = user.tag.split("#")
	Object.assign(user, { username: split.slice(0, split.length - 1).join("#"), discriminator: split[split.length - 1], bot: !!user.bot, avatar: typeof user.avatar === "string" && user.avatar.length === 0 ? null : user.avatar })
	return user as unknown as import("discord-typings").User
}

export async function getAvatarJimp(userID: string) {
	const user = await getUser(userID)
	if (!user) return null
	const url = displayAvatarURL(user, true)
	if (!url) return null
	const validation = await fetch(url, { method: "HEAD" })
	if (validation.headers["content-type"] && validation.headers["content-type"].startsWith("image/")) return Jimp.read(url)

	const data = await client.snow.user.getUser(userID)
	if (data) orm.db.upsert("users", { id: userID, tag: `${data.username}#${data.discriminator}`, avatar: data.avatar, bot: data.bot ? 1 : 0, added_by: config.cluster_id })
	const newURL = displayAvatarURL(data, true)
	if (!newURL) return null
	return Jimp.read(newURL)
}

export function displayAvatarURL(user: import("discord-typings").User, dynamic?: boolean) {
	if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator) % 5}.png`
	return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${dynamic && user.avatar.startsWith("a_") ? "gif" : "png"}`
}

export function createPagination(cmd: import("discord-typings").Interaction, title: Array<string>, rows: Array<Array<string>>, align: Array<"left" | "right" | "none">, maxLength: number) {
	let alignedRows = arr.tableifyRows([title].concat(rows), align, () => "`")
	const formattedTitle = alignedRows[0].replace(/`.+?`/g, sub => `__**\`${sub}\`**__`)
	alignedRows = alignedRows.slice(1)
	const pages = arr.createPages(alignedRows, maxLength - formattedTitle.length - 1, 16, 4)
	paginate(pages.length, (page, component) => {
		const data: Parameters<typeof client.snow.interaction.editOriginalInteractionResponse>["2"] = {
			embeds: [
				{
					color: constants.standard_embed_color,
					description: `${formattedTitle}\n${pages[page].join("\n")}`,
					footer: {
						text: `Page ${page + 1} of ${pages.length}`
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
			page = Number(interaction.data?.values?.[0].value || 0)
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
