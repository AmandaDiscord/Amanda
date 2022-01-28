import Discord from "thunderstorm"
import Jimp from "jimp"
import c from "centra"

import passthrough from "../passthrough"
const { client, sync, config } = passthrough

const orm = sync.require("./orm") as typeof import("./orm")

export async function getUser(id: string) {
	if (id === client.user?.id) return client.user
	const cached = await orm.db.get("users", { id: id })
	if (cached) return convertCachedUser(cached)
	const fetched = await client.fetchUser(id).catch(() => null)
	if (fetched) orm.db.upsert("users", { id: id, tag: `${fetched.username}#${fetched.discriminator}`, avatar: fetched.avatar || "", bot: fetched.bot ? 1 : 0, added_by: config.cluster_id })
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
	if (data) orm.db.upsert("users", { id: userID, tag: `${data.username}#${data.discriminator}`, avatar: data.avatar || "", bot: data.bot ? 1 : 0 })
	const newuser = new Discord.User(client, data)
	const newURL = newuser.displayAvatarURL({ dynamic: true })
	if (!newURL) return null
	return Jimp.read(newURL)
}

export default exports as typeof import("./discord")
