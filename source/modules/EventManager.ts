import Discord from "thunderstorm"
import { Manager } from "lavacord"

import passthrough from "../passthrough"
const { client, sync, commands, config, constants, queues } = passthrough
let starting = true
if (client.readyAt) starting = false

const text = sync.require("../utils/string") as typeof import("../utils/string")
const lang = sync.require("../utils/language") as typeof import("../utils/language")
const logger = sync.require("../utils/logger") as typeof import("../utils/logger")
const orm = sync.require("../utils/orm") as typeof import("../utils/orm")

sync.addTemporaryListener(client, "raw", async p => {
	if (p.t === "READY") {
		// this code needs to run before anything
		let firstStart = true
		if (passthrough.clusterData.connected_shards.includes(p.shard_id)) {
			firstStart = false
			passthrough.clusterData.guild_ids[p.shard_id].length = 0
		} else {
			passthrough.clusterData.guild_ids[p.shard_id] = []
			passthrough.clusterData.connected_shards.push(p.shard_id)
		}
		passthrough.clusterData.guild_ids[p.shard_id].push(...p.d.guilds.map(g => g.id))

		if (passthrough.clusterData.guild_ids[p.shard_id].length !== 0 && firstStart) {
			const arr = passthrough.clusterData.guild_ids[p.shard_id]
			await orm.db.raw(`DELETE FROM voice_states WHERE guild_id IN (${arr.map((_, index) => `$${index + 1}`).join(", ")})`, arr)
			logger.info(`Deleted voice states in ${passthrough.clusterData.guild_ids[p.shard_id].length} guilds for shard ${p.shard_id}`)
		}

		if (starting) {
			starting = false
			logger.info(`Successfully logged in as ${client.user!.username}`)
			process.title = client.user!.username

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
				node.resumeKey = `${client.user!.id}/${config.cluster_id}`
				node.resumeTimeout = 75
			}

			client.lavalink = new Manager(constants.lavalinkNodes.filter(n => n.enabled), {
				user: client.user!.id,
				shards: config.total_shards,
				send: (packet) => {
					passthrough.requester.request(constants.GATEWAY_WORKER_CODES.SEND_MESSAGE, packet, (d) => passthrough.gateway.postMessage(d))
				}
			})

			client.lavalink.once("ready", () => {
				logger.info("Lavalink ready")
			})

			client.lavalink.on("error", error => logger.error(`There was a LavaLink error: ${error && (error as Error).message ? (error as Error).message : error}`))

			try {
				await client.lavalink.connect()
			} catch (e) {
				logger.error("There was a lavalink connect error. One of the nodes may be offline or unreachable\n" + await text.stringify(e, 3))
			}
		}
	} else if (p.t === "GUILD_CREATE") {
		orm.db.upsert("guilds", { id: p.d.id, name: p.d.name, icon: p.d.icon, member_count: p.d.member_count, owner_id: p.d.owner_id, added_by: config.cluster_id })
		if (passthrough.clusterData.guild_ids[p.shard_id].includes(p.d.id)) return
		else passthrough.clusterData.guild_ids[p.shard_id].push(p.d.id)
		for (const state of p.d.voice_states as Array<import("discord-typings").VoiceStateData>) {
			orm.db.upsert("voice_states", { guild_id: state.guild_id, channel_id: state.channel_id!, user_id: state.user_id })
		}
	} else if (p.t === "GUILD_DELETE") {
		if (!p.d.unavailable) orm.db.delete("guilds", { id: p.d.id })
		if (!passthrough.clusterData.guild_ids[p.shard_id]) passthrough.clusterData.guild_ids[p.shard_id] = []
		const previous = passthrough.clusterData.guild_ids[p.shard_id].indexOf(p.d.id)
		if (previous !== -1) passthrough.clusterData.guild_ids[p.shard_id].splice(previous, 1)
	} else if (p.t === "VOICE_STATE_UPDATE") {
		if (p.d.channel_id === null) orm.db.delete("voice_states", { guild_id: p.d.guild_id, user_id: p.d.user_id })
		else orm.db.upsert("voice_states", { guild_id: p.d.guild_id, user_id: p.d.user_id, channel_id: p.d.channel_id })
		client.lavalink?.voiceStateUpdate(p.d)
		queues.get(p.d.guild_id)?.voiceStateUpdate(p.d)
	} else if (p.t === "VOICE_SERVER_UPDATE") client.lavalink?.voiceServerUpdate(p.d)
})

sync.addTemporaryListener(client, "interactionCreate", async (interaction: import("thunderstorm").Interaction) => {

	if (interaction.isCommand()) {
		const selfLang = lang.getLang(interaction.locale!)
		const guildLang = interaction.guildLocale ? lang.getLang(interaction.guildLocale) : null
		const langToUse = interaction.guildLocale && interaction.guildLocale != interaction.locale ? guildLang! : selfLang

		try {
			await commands.cache.get((interaction as import("thunderstorm").CommandInteraction).commandName)?.process(interaction as import("thunderstorm").CommandInteraction, langToUse)
		} catch (e) {
			const cmd = (interaction as import("thunderstorm").CommandInteraction)
			if (e && e.code) {
				if (e.code == 10008) return
				if (e.code == 50013) return
			}
			// Report to original channel
			const msgTxt = `command ${cmd.commandName} failed <:rip:401656884525793291>\n` + (await text.stringify(e))
			const embed = new Discord.MessageEmbed()
				.setDescription(msgTxt)
				.setColor(0xdd2d2d)

			const str = `There was an error with the command ${cmd.commandName} <:rip:401656884525793291>. The developers have been notified. If you use this command again and you see this message, please allow a reasonable time frame for this to be fixed`

			if (cmd.deferred || cmd.replied) cmd.editReply({ content: str, embeds: [embed] }).catch(() => logger.error("Error with sending alert that command failed. Probably a 403 resp code"))
			cmd.followUp({ content: str, embeds: [embed] }).catch(() => logger.error("Error with sending alert that command failed. Probably a 403 resp code"))

			// Report to #amanda-error-log
			embed.setTitle("Command error occurred.")
			let details = [
				["User", cmd.user.tag],
				["User ID", cmd.user.id],
				["Bot", cmd.user.bot ? "Yes" : "No"]
			]
			if (cmd.guild) {
				details = details.concat([
					["Guild ID", cmd.guild.id],
					["Channel ID", cmd.channel?.id || "NONE"]
				])
			} else {
				details = details.concat([
					["DM", "Yes"]
				])
			}
			const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
			const detailsString = details.map(row =>
				`\`${row[0]}${" ​".repeat(maxLength - row[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
			).join("\n")
			embed.addFields([
				{ name: "Details", value: detailsString },
				{ name: "Message content", value: `\`\`\`\n${cmd.toString().replace(/`/g, "ˋ")}\`\`\`` }
			])
			if (!config.is_dev_env) new Discord.PartialChannel(client, { id: "512869106089852949" }).send({ embeds: [embed] })
		}
	}
})
