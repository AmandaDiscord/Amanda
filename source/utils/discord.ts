import Discord from "thunderstorm"

import passthrough from "../passthrough"
const { client, sync } = passthrough

const orm = sync.require("./orm") as typeof import("./orm")

export async function getUser(id: string) {
	if (id === client.user?.id) return client.user
	const cached = await orm.db.get("users", { id: id })
	if (cached) return convertCachedUser(cached)
	const fetched = await client.fetchUser(id).catch(() => null)
	if (fetched) orm.db.upsert("users", { id: id, tag: `${fetched.username}#${fetched.discriminator}`, avatar: fetched.avatar || "", bot: fetched.bot ? 1 : 0 })
	return fetched
}

export function convertCachedUser(user: import("../types").InferModelDef<typeof orm.db["tables"]["users"]>) {
	const split = user.tag.split(/#\d{4}$/)
	Object.assign(user, { username: split[0], discriminator: split[1], bot: !!user.bot, avatar: typeof user.avatar === "string" && user.avatar.length === 0 ? null : user.avatar })
	return new Discord.User(client, user as typeof user & { username: string; discriminator: string; bot: boolean; })
}

export default exports as typeof import("./discord")
