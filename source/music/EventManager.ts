import util from "util"

import cc from "callback-components"

import Command from "../Command"

import passthrough from "../passthrough"
const { commands, constants, snow, config, sync, amqpChannel, queues } = passthrough

const lang: typeof import("../client/utils/language") = sync.require("../client/utils/language")

const backtickRegex = /`/g

type MusicInboundPacket = import("discord-api-types/v10").GatewayDispatchPayload |
	{ t: "AMANDA_WEBSITE_MESSAGE", op: import("../constants").WebsiteOPCodes, d: any }

export async function handle(packet: MusicInboundPacket & { shard_id: number }) {
	if (packet.t === "INTERACTION_CREATE") {
		const interaction = packet.d as import("discord-api-types/v10").APIChatInputApplicationCommandInteraction
		if (interaction.type === 2) {
			const selfLang = lang.getLang(interaction.locale!)

			const user = interaction.user ? interaction.user : interaction.member!.user
			try {
				const cmd = new Command(interaction)
				await commands.cache.get(interaction.data!.name)?.process(cmd, selfLang, { shard_id: -1, cluster_id: "unknown" })
			} catch (e) {
				if (e && e.code) {
					if (e.code == 10008) return
					if (e.code == 50013) return
				}

				const embed: import("discord-api-types/v10").APIEmbed = {
					description: lang.replace(selfLang.GLOBAL.COMMAND_ERROR, { "name": interaction.data!.name, "server": constants.server }),
					color: 0xdd2d2d
				}

				// Report to original channel
				snow.interaction.createFollowupMessage(interaction.application_id, interaction.token, { embeds: [embed] }).catch(() => console.error("Error with sending alert that command failed. Probably a 403 resp code"))

				// Report to #amanda-error-log
				embed.title = "Command error occured."
				embed.description = util.inspect(e)
				const details = [
					["Tree", config.cluster_id],
					["Branch", String(packet.shard_id)],
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
				embed.fields = [
					{ name: "Details", value: detailsString },
					{ name: "Message content", value: `\`\`\`\n${JSON.stringify(interaction.data).replace(backtickRegex, "ˋ")}\`\`\`` }
				]

				snow.channel.createMessage("512869106089852949", { embeds: [embed] })
			}
		} else if (interaction.type === 3) cc.handle(interaction)


	} else if (packet.t === "VOICE_STATE_UPDATE") {
		passthrough.lavalink.voiceStateUpdate(packet.d as import("lavacord").VoiceStateUpdate)
		queues.get(packet.d.guild_id!)?.voiceStateUpdate(packet.d)


	} else if (packet.t === "VOICE_SERVER_UPDATE") passthrough.lavalink.voiceServerUpdate(packet.d as import("lavacord").VoiceServerUpdate)
	else if (packet.t === "AMANDA_WEBSITE_MESSAGE") {
		const qs = [...queues.values()]
		const queue = qs.find(q => q.voiceChannelID === packet.d?.channel_id)


		if (packet.op === constants.WebsiteOPCodes.CLEAR_QUEUE) {
			if (queue) {
				queue.tracks.splice(1)
				amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue.voiceChannelID, op: constants.WebsiteOPCodes.CLEAR_QUEUE } })))
			}


		} else if (packet.op === constants.WebsiteOPCodes.ATTRIBUTES_CHANGE) {
			if (queue && packet.d) {
				if (packet.d.loop !== undefined) queue.loop = packet.d.loop as boolean
				amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue.voiceChannelID, op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: { loop: queue.loop } } })))
			}


		} else if (packet.op === constants.WebsiteOPCodes.SKIP && queue) queue.skip()
		else if (packet.op === constants.WebsiteOPCodes.STOP && queue) queue.destroy()
		else if (packet.op === constants.WebsiteOPCodes.TOGGLE_PLAYBACK && queue) queue.paused = !queue.paused
		else if (packet.op === constants.WebsiteOPCodes.TRACK_REMOVE && queue && packet.d && packet.d.index) {
			const result = await queue.removeTrack(packet.d.index as number)
			if (result === 0) amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue.voiceChannelID, op: constants.WebsiteOPCodes.TRACK_REMOVE, d: { index: packet.d.index } } })))
		}
	}
}

export default exports as typeof import("./EventManager")
