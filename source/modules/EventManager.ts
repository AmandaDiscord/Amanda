import { Manager } from "lavacord"
import { BetterComponent } from "callback-components"

import passthrough from "../passthrough"
const { client, sync, commands, config, constants, queues } = passthrough
let starting = true
if (client.ready) starting = false

const text = sync.require("../utils/string") as typeof import("../utils/string")
const lang = sync.require("../utils/language") as typeof import("../utils/language")
const logger = sync.require("../utils/logger") as typeof import("../utils/logger")
const orm = sync.require("../utils/orm") as typeof import("../utils/orm")
const cluster = sync.require("../utils/cluster") as typeof import("../utils/cluster")

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
	const stats = await cluster.getOwnStats()
	await orm.db.insert("stat_logs", {
		time,
		id: client.user.id,
		ram_usage_kb: stats.ram,
		users: stats.users,
		guilds: stats.guilds,
		channels: stats.channels,
		voice_connections: stats.connections,
		uptime: stats.uptime,
		shard: config.shard_list[0]
	})

	setTimeoutForStats()
}

setTimeoutForStats()

sync.addTemporaryListener(client, "gateway", async (p: import("discord-typings").GatewayPayload & { shard_id: number }) => {
	if (p.t === "READY") {
		const data = p.d as import("discord-typings").ReadyPayload
		client.ready = true
		client.user = data.user
		client.application = data.application
		client.emit("ready")
		// this code needs to run before anything
		let firstStart = true
		if (passthrough.clusterData.connected_shards.includes(p.shard_id)) {
			firstStart = false
			passthrough.clusterData.guild_ids[p.shard_id].length = 0
		} else {
			passthrough.clusterData.guild_ids[p.shard_id] = []
			passthrough.clusterData.connected_shards.push(p.shard_id)
		}
		passthrough.clusterData.guild_ids[p.shard_id].push(...data.guilds.map(g => g.id))

		if (passthrough.clusterData.guild_ids[p.shard_id].length !== 0 && firstStart) {
			const arr = passthrough.clusterData.guild_ids[p.shard_id]
			await orm.db.raw(`DELETE FROM voice_states WHERE guild_id IN (${arr.map(i => `'${i}'`).join(", ")})`)
			logger.info(`Deleted voice states in ${arr.length} guilds for shard ${p.shard_id}`)
		}

		if (starting) {
			starting = false
			logger.info(`Successfully logged in as ${client.user.username}`)
			process.title = client.user.username

			const [lavalinkNodeData, lavalinkNodeRegions] = await Promise.all([
				orm.db.select("lavalink_nodes"),
				orm.db.select("lavalink_node_regions")
			])
			const lavalinkNodes = lavalinkNodeData.map(node => {
				const newData = {
					regions: lavalinkNodeRegions.filter(row => row.host === node.host).map(row => row.region),
					password: config.lavalink_password,
					id: node.name.toLowerCase()
				}
				return Object.assign(newData, { host: node.host, port: node.port, invidious_origin: node.invidious_origin, name: node.name, search_with_invidious: node.search_with_invidious, enabled: node.enabled })
			})

			constants.lavalinkNodes.push(...lavalinkNodes)

			for (const node of constants.lavalinkNodes) {
				node.resumeKey = `${client.user.id}/${config.cluster_id}`
				node.resumeTimeout = 75
			}

			client.lavalink = new Manager(constants.lavalinkNodes.filter(n => n.enabled), {
				user: client.user.id,
				shards: config.total_shards,
				send: (packet) => passthrough.requester.request(constants.GATEWAY_WORKER_CODES.SEND_MESSAGE, packet, (d) => passthrough.gateway.postMessage(d))
			})

			client.lavalink.once("ready", () => logger.info("Lavalink ready"))

			client.lavalink.on("error", error => logger.error(`There was a LavaLink error: ${error && (error as Error).message ? (error as Error).message : error}`))

			try {
				await client.lavalink.connect()
			} catch (e) {
				logger.error("There was a lavalink connect error. One of the nodes may be offline or unreachable\n" + await text.stringify(e, 3))
			}
		}
	}

	if (!client.ready) return logger.warn(`packet was dropped as client wasn't ready:\n${await text.stringify(p)}`)

	if (p.t === "GUILD_CREATE") {
		const data = p.d as import("discord-typings").Guild
		orm.db.upsert("guilds", { id: data.id, name: data.name, icon: data.icon!, member_count: data.member_count, owner_id: data.owner_id, added_by: config.cluster_id })
		if (passthrough.clusterData.guild_ids[p.shard_id].includes(data.id)) return
		else passthrough.clusterData.guild_ids[p.shard_id].push(data.id)
		for (const state of data.voice_states || []) {
			orm.db.upsert("voice_states", { guild_id: state.guild_id, channel_id: state.channel_id!, user_id: state.user_id })
		}
	} else if (p.t === "GUILD_DELETE") {
		if (!p.d.unavailable) orm.db.delete("guilds", { id: p.d.id })
		if (!passthrough.clusterData.guild_ids[p.shard_id]) passthrough.clusterData.guild_ids[p.shard_id] = []
		const previous = passthrough.clusterData.guild_ids[p.shard_id].indexOf(p.d.id)
		if (previous !== -1) passthrough.clusterData.guild_ids[p.shard_id].splice(previous, 1)
	} else if (p.t === "VOICE_STATE_UPDATE") {
		const data = p.d as import("discord-typings").VoiceState
		if (data.channel_id === null) orm.db.delete("voice_states", { user_id: data.user_id, guild_id: data.guild_id })
		else orm.db.upsert("voice_states", { guild_id: p.d.guild_id, user_id: p.d.user_id, channel_id: data.channel_id }, { useBuffer: false })
		client.lavalink?.voiceStateUpdate(data as import("lavacord").VoiceStateUpdate)
		queues.get(p.d.guild_id)?.voiceStateUpdate(p.d)
	} else if (p.t === "VOICE_SERVER_UPDATE") client.lavalink?.voiceServerUpdate(p.d)
	else if (p.t === "INTERACTION_CREATE") {
		const interaction = p.d as import("discord-typings").Interaction
		if (interaction.type === 2) {
			const selfLang = lang.getLang(interaction.locale!)
			const guildLang = interaction.guild_locale ? lang.getLang(interaction.guild_locale) : null
			const langToUse = guildLang && interaction.guild_locale != interaction.locale ? guildLang : selfLang

			const user = interaction.user ? interaction.user : interaction.member!.user
			orm.db.upsert("users", { id: user.id, tag: `${user.username}#${user.discriminator}`, avatar: user.avatar, bot: user.bot ? 1 : 0, added_by: config.cluster_id })
			try {
				await commands.cache.get(interaction.data!.name)?.process(interaction, langToUse)
			} catch (e) {
				if (e && e.code) {
					if (e.code == 10008) return
					if (e.code == 50013) return
				}

				const embed: import("discord-typings").Embed = {
					description: `There was an error with the command ${interaction.data!.name} <:rip:401656884525793291>. The developers have been notified. If you use this command again and you see this message, please allow a reasonable time frame for this to be fixed`,
					color: 0xdd2d2d
				}

				// Report to original channel
				client.snow.interaction.createFollowupMessage(interaction.application_id, interaction.token, { embeds: [embed] }).catch(() => logger.error("Error with sending alert that command failed. Probably a 403 resp code"))

				// Report to #amanda-error-log
				embed.title = "Command error occured."
				embed.description = await text.stringify(e)
				let details = [
					["User", `${user.username}#${user.discriminator}`],
					["User ID", user.id],
					["Bot", user.bot ? "Yes" : "No"]
				]
				if (interaction.guild_id) {
					details = details.concat([
						["Guild ID", interaction.guild_id],
						["Channel ID", interaction.channel_id || "NONE"]
					])
				} else {
					details = details.concat([
						["DM", "Yes"]
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
					{ name: "Message content", value: `\`\`\`\n/${properties.filter(Boolean).join(" ").replace(/`/g, "ˋ")}\`\`\`` }
				]

				client.snow.channel.createMessage("512869106089852949", { embeds: [embed] })
			}
		} else if (interaction.type === 3) return BetterComponent.handle(interaction)
	}
})
