import { BetterComponent } from "callback-components"

import passthrough from "../../passthrough"
const { client, sync, commands, config, constants } = passthrough

import Command from "./Command"

const text: typeof import("../utils/string") = sync.require("../utils/string")
const lang: typeof import("../utils/language") = sync.require("../utils/language")
const orm: typeof import("../utils/orm") = sync.require("../utils/orm")
const cluster: typeof import("../utils/cluster") = sync.require("../utils/cluster")

function getTimeoutForStatsPosting() {
	const mins10inms = 1000 * 60 * 10
	const currently = Date.now()
	return { now: currently, remaining: mins10inms - (currently % mins10inms) }
}

let statsTimeout: NodeJS.Timeout

function setTimeoutForStats() {
	const dateExpected = getTimeoutForStatsPosting()
	statsTimeout = setTimeout(() => onStatsPosting(dateExpected.now + dateExpected.remaining), dateExpected.remaining)
}

async function onStatsPosting(time: number) {
	if (config.db_enabled) {
		const stats = await cluster.getOwnStats()
		await orm.db.insert("stat_logs", {
			time,
			id: client.user.id,
			ram_usage_kb: Math.floor(stats.ram / 1000), // stats.ram is in bytes
			users: stats.users,
			guilds: stats.guilds,
			channels: stats.connections,
			voice_connections: stats.connections,
			uptime: Math.floor(stats.uptime),
			shard: config.shard_list[0]
		})
	}

	setTimeoutForStats()
}

setTimeoutForStats()

sync.addTemporaryListener(sync.events, __filename, () => {
	clearTimeout(statsTimeout)
})

const backtickRegex = /`/g

sync.addTemporaryListener(client, "gateway", async (p: import("discord-typings").GatewayPayload & { shard_id: number; cluster_id: string }) => {
	if (p.t === "GUILD_CREATE") orm.db.upsert("guilds", { client_id: client.user.id, guild_id: p.d.id, cluster_id: p.cluster_id, shard_id: p.shard_id })
	else if (p.t === "GUILD_DELETE") {
		if (!p.d.unavailable) orm.db.delete("guilds", { client_id: client.user.id, guild_id: p.d.id })
	} else if (p.t === "VOICE_STATE_UPDATE") {
		const data: import("discord-typings").VoiceState = p.d
		if (data.channel_id === null && config.db_enabled) orm.db.delete("voice_states", { user_id: data.user_id, guild_id: data.guild_id })
		else if (config.db_enabled) orm.db.upsert("voice_states", { guild_id: p.d.guild_id, user_id: p.d.user_id, channel_id: data.channel_id || undefined }, { useBuffer: false })
		fetch(`${config.website_protocol}://${config.website_domain}/voice-state-update`, { headers: { Authorization: config.bot_token }, body: JSON.stringify(data) })
	} else if (p.t === "VOICE_SERVER_UPDATE") fetch(`${config.website_protocol}://${config.website_domain}/voice-server-update`, { headers: { Authorization: config.bot_token }, body: JSON.stringify(p.d) })
	else if (p.t === "INTERACTION_CREATE") {
		const interaction: import("discord-typings").Interaction = p.d
		if (interaction.type === 2) {
			const selfLang = lang.getLang(interaction.locale!)

			const user = interaction.user ? interaction.user : interaction.member!.user
			if (config.db_enabled) orm.db.upsert("users", { id: user.id, tag: `${user.username}#${user.discriminator}`, avatar: user.avatar, bot: user.bot ? 1 : 0, added_by: config.cluster_id })
			try {
				const cmd = new Command(interaction)
				await commands.cache.get(interaction.data!.name)?.process(cmd, selfLang, { shard_id: p.shard_id, cluster_id: p.cluster_id })
			} catch (e) {
				if (e && e.code) {
					if (e.code == 10008) return
					if (e.code == 50013) return
				}

				const embed: import("discord-typings").Embed = {
					description: lang.replace(selfLang.GLOBAL.COMMAND_ERROR, { "name": interaction.data!.name, "server": constants.server }),
					color: 0xdd2d2d
				}

				// Report to original channel
				client.snow.interaction.createFollowupMessage(interaction.application_id, interaction.token, { embeds: [embed] }).catch(() => console.error("Error with sending alert that command failed. Probably a 403 resp code"))

				// Report to #amanda-error-log
				embed.title = "Command error occured."
				embed.description = await text.stringify(e)
				const details = [
					["Tree", config.cluster_id],
					["Branch", String(p.shard_id)],
					["User", `${user.username}#${user.discriminator}`],
					["User ID", user.id],
					["Bot", user.bot ? "Yes" : "No"],
					["DM", interaction.guild_id ? "No" : "Yes"]
				]
				if (interaction.guild_id) {
					details.push(...[
						["Guild ID", interaction.guild_id],
						["Channel ID", interaction.channel_id || "NONE"]
					])
				}
				const maxLength = details.reduce((page, c) => Math.max(page, c[0].length), 0)
				const detailsString = details.map(row =>
					`\`${row[0]}${" ​".repeat(maxLength - row[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
				).join("\n")
				type notSub = Exclude<import("discord-typings").ApplicationCommandInteractionDataOption, import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeSub | import("discord-typings").ApplicationCommandInteractionDataOptionNotTypeNarrowed>
				const properties = [
					interaction.data!.name,
					interaction.data!.options?.map((o) => `${o.name}:${(o as notSub).value}`)
				]
				embed.fields = [
					{ name: "Details", value: detailsString },
					{ name: "Message content", value: `\`\`\`\n/${properties.filter(Boolean).join(" ").replace(backtickRegex, "ˋ")}\`\`\`` }
				]

				client.snow.channel.createMessage("512869106089852949", { embeds: [embed] })
			}
		} else if (interaction.type === 3) return BetterComponent.handle(interaction)
	}
})
