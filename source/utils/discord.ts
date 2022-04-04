import Discord, { Interaction } from "thunderstorm"
import Jimp from "jimp"
import c from "centra"
import { BetterComponent } from "callback-components"

import passthrough from "../passthrough"
const { client, sync, config, constants } = passthrough

const orm = sync.require("./orm") as typeof import("./orm")
const arr = sync.require("./array") as typeof import("./array")

export async function getUser(id: string) {
	if (id === client.user?.id) return client.user
	const cached = await orm.db.get("users", { id: id })
	if (cached) return convertCachedUser(cached)
	const fetched = await client.fetchUser(id).catch(() => null)
	if (fetched) orm.db.upsert("users", { id: id, tag: `${fetched.username}#${fetched.discriminator}`, avatar: fetched.avatar, bot: fetched.bot ? 1 : 0, added_by: config.cluster_id })
	return fetched
}

export function convertCachedUser(user: import("../types").InferModelDef<typeof orm.db["tables"]["users"]>) {
	const split = user.tag.split("#")
	Object.assign(user, { username: split.slice(0, split.length - 1).join("#"), discriminator: split[split.length - 1], bot: !!user.bot, avatar: typeof user.avatar === "string" && user.avatar.length === 0 ? null : user.avatar })
	return new Discord.User(client, user as typeof user & { username: string; discriminator: string; bot: boolean; })
}

export async function getAvatarJimp(userID: string) {
	const user = await getUser(userID)
	if (!user) return null
	const url = user.displayAvatarURL({ dynamic: true })
	if (!url) return null
	const validation = await c(url, "head").send()
	if (validation.headers["content-type"] && validation.headers["content-type"].startsWith("image/")) return Jimp.read(url)

	const data = await client.fetchUser(userID)
	if (data) orm.db.upsert("users", { id: userID, tag: `${data.username}#${data.discriminator}`, avatar: data.avatar, bot: data.bot ? 1 : 0, added_by: config.cluster_id })
	const newuser = new Discord.User(client, data)
	const newURL = newuser.displayAvatarURL({ dynamic: true })
	if (!newURL) return null
	return Jimp.read(newURL)
}

export function createPagination(cmd: import("thunderstorm").CommandInteraction, title: Array<string>, rows: Array<Array<string>>, align: Array<"left" | "right" | "none">, maxLength: number) {
	let alignedRows = arr.tableifyRows([title].concat(rows), align, () => "`")
	const formattedTitle = alignedRows[0].replace(/`.+?`/g, sub => `__**\`${sub}\`**__`)
	alignedRows = alignedRows.slice(1)
	const pages = arr.createPages(alignedRows, maxLength - formattedTitle.length - 1, 16, 4)
	paginate(pages.length, (page, component) => {
		return cmd.editReply({
			embeds: [
				new Discord.MessageEmbed()
					.setColor(constants.standard_embed_color)
					.setDescription(`${formattedTitle}\n${pages[page].join("\n")}`)
					.setFooter(`Page ${page + 1} of ${pages.length}`)
			],
			components: component ? [new Discord.MessageActionRow().addComponents([component.toComponent()])] : undefined
		})
	})
}

export function paginate(pageCount: number, callback: (page: number, component: BetterComponent | null) => unknown) {
	let page = 0
	if (pageCount > 1) {
		let menuExpires: NodeJS.Timeout
		const options = Array(pageCount).fill(null).map((_, i) => ({ label: `Page ${i + 1}`, value: String(i), description: null, emoji: null, default: false }))
		const component = new BetterComponent({
			type: Discord.Constants.MessageComponentTypes.SELECT_MENU,
			placeholder: "Select page",
			maxValues: 1,
			minValues: 1,
			options
		})

		component.setCallback(interaction => {
			interaction.deferUpdate()
			page = Number((interaction as unknown as import("thunderstorm").SelectMenuInteraction).values[0])
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
