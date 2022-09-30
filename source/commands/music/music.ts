import crypto from "crypto"

import passthrough from "../../passthrough"
const { client, commands, constants, sync, queues, config, websiteSocket } = passthrough

const common = sync.require("./utils") as typeof import("./utils")
const queueFile = sync.require("./queue") as typeof import("./queue")
const trackTypes = sync.require("./tracktypes") as typeof import("./tracktypes")

const arr = sync.require("../../utils/array") as typeof import("../../utils/array")
const orm = sync.require("../../utils/orm") as typeof import("../../utils/orm")
const language = sync.require("../../utils/language") as typeof import("../../utils/language")
const text = sync.require("../../utils/string") as typeof import("../../utils/string")
const time = sync.require("../../utils/time") as typeof import("../../utils/time")
const logger = sync.require("../../utils/logger") as typeof import("../../utils/logger")

const waitForClientVCJoinTimeout = 5000

const musicDisabled = false as boolean

commands.assign([
	{
		name: "music",
		description: "The main music interface",
		category: "audio",
		options: [
			{
				name: "play",
				type: 3,
				description: "Play music from multiple sites.",
				required: false
			},
			{
				name: "stop",
				type: 5,
				description: "If the queue should stop. True to reveal you initiated the stop",
				required: false
			},
			{
				name: "skip",
				type: 5,
				description: "If the queue should skip the current track. True to reveal you initiated the skip",
				required: false
			},
			{
				name: "volume",
				type: 4,
				min_value: 1,
				max_value: 500,
				description: "Set the volume % of the queue",
				required: false
			},
			{
				name: "queue",
				type: 4,
				description: "Show the queue page",
				min_value: 1,
				required: false
			},
			{
				name: "auto",
				type: 5,
				description: "Set the state of auto mode for the queue",
				required: false
			},
			{
				name: "loop",
				type: 5,
				description: "Set the state of loop mode for the queue",
				required: false
			},
			{
				name: "now",
				type: 5,
				description: "Show the now playing message. True to only show yourself",
				required: false
			},
			{
				name: "info",
				type: 5,
				description: "Shows the info about the current playing track. True to only show yourself",
				required: false
			},
			{
				name: "pause",
				type: 5,
				description: "Sets the paused state of the queue",
				required: false
			},
			{
				name: "related",
				type: 5,
				description: "Shows the related tracks to the current playing track. True to only show yourself",
				required: false
			},
			{
				name: "lyrics",
				type: 5,
				description: "Shows the lyrics of the current playing track. True to only show yourself",
				required: false
			},
			{
				name: "seek",
				type: 4,
				description: "Seek to the current time in the current playing track",
				min_value: 1,
				required: false
			},
			{
				name: "pitch",
				type: 4,
				description: "Sets the pitch of the queue in decibals",
				min_value: -7,
				max_value: 7,
				required: false
			},
			{
				name: "speed",
				type: 4,
				description: "Sets the speed % of the queue",
				min_value: 1,
				max_value: 500,
				required: false
			},
			{
				name: "filters",
				type: 3,
				description: "Applies pre-made filters to the queue",
				choices: [
					{
						name: "Nightcore",
						value: "nc"
					},
					{
						name: "Anti-Nightcore",
						value: "anc"
					}
				],
				required: false
			},
			{
				name: "frisky",
				type: 3,
				description: "Play music from frisky.fm stations",
				choices: [
					{
						name: "original",
						value: "original"
					},
					{
						name: "deep",
						value: "deep"
					},
					{
						name: "chill",
						value: "chill"
					},
					{
						name: "classics",
						value: "classics"
					}
				],
				required: false
			},
			{
				name: "listenmoe",
				type: 3,
				description: "Play music from listen.moe stations",
				choices: [
					{
						name: "jpop",
						value: "jp"
					},
					{
						name: "kpop",
						value: "kp"
					}
				],
				required: false
			},
			{
				name: "shuffle",
				type: 5,
				description: "Shuffle the queue in place. True to only show yourself",
				required: false
			}
		],
		async process(cmd, lang) {
			if (musicDisabled) return client.snow.interaction.createInteractionResponse(cmd.application_id, cmd.token, { type: 4, data: { content: "Working on fixing currently. This is a lot harder than people think" } })
			if (!cmd.guild_id) return client.snow.interaction.createInteractionResponse(cmd.application_id, cmd.token, { type: 4, data: { content: lang.GLOBAL.GUILD_ONLY } })

			const optionPlay = (cmd.data?.options?.find(o => o.name === "play") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)?.value ?? null
			const optionStop = (cmd.data?.options?.find(o => o.name === "stop") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
			const optionSkip = (cmd.data?.options?.find(o => o.name === "skip") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
			const optionVolume = (cmd.data?.options?.find(o => o.name === "volume") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeNumber)?.value ?? null
			const optionQueue = (cmd.data?.options?.find(o => o.name === "queue") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeNumber)?.value ?? null
			const optionAuto = (cmd.data?.options?.find(o => o.name === "auto") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
			const optionLoop = (cmd.data?.options?.find(o => o.name === "loop") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
			const optionNow = (cmd.data?.options?.find(o => o.name === "now") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
			const optionInfo = (cmd.data?.options?.find(o => o.name === "info") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
			const optionPause = (cmd.data?.options?.find(o => o.name === "pause") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
			const optionRelated = (cmd.data?.options?.find(o => o.name === "related") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
			const optionLyrics = (cmd.data?.options?.find(o => o.name === "lyrics") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
			const optionSeek = (cmd.data?.options?.find(o => o.name === "seek") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeNumber)?.value ?? null
			const optionPitch = (cmd.data?.options?.find(o => o.name === "pitch") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeNumber)?.value ?? null
			const optionSpeed = (cmd.data?.options?.find(o => o.name === "speed") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeNumber)?.value ?? null
			const optionFilters = (cmd.data?.options?.find(o => o.name === "filters") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)?.value ?? null
			const optionFrisky = (cmd.data?.options?.find(o => o.name === "frisky") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)?.value ?? null
			const optionListenmoe = (cmd.data?.options?.find(o => o.name === "listenmoe") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)?.value ?? null
			const optionShuffle = (cmd.data?.options?.find(o => o.name === "shuffle") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null

			const array = [
				optionPlay,
				optionStop,
				optionSkip,
				optionVolume,
				optionQueue,
				optionAuto,
				optionLoop,
				optionNow,
				optionInfo,
				optionPause,
				optionRelated,
				optionLyrics,
				optionSeek,
				optionPitch,
				optionSpeed,
				optionFilters,
				optionFrisky,
				optionListenmoe,
				optionShuffle
			]

			const notNull = array.filter(i => i !== null)

			const author = cmd.user ? cmd.user : cmd.member!.user

			if (notNull.length === 0) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.MUSIC_INVALID_ACTION, { username: author.username, prefix: "/" }) } })
			if (notNull.length > 1) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "You can only do 1 action at a time" } })

			let queue = queues.get(cmd.guild_id)
			if (!queue && [optionPlay, optionFrisky, optionListenmoe].every(i => i === null)) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: author.username }) } })

			let ephemeral = false
			const shouldBeEphemeral = [optionStop, optionSkip, optionNow, optionInfo, optionRelated, optionLyrics, optionShuffle]
			if (shouldBeEphemeral.includes(true)) ephemeral = true

			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5, data: { flags: ephemeral ? (1 << 6) : 0 } })
			const userVoiceState = await orm.db.get("voice_states", { user_id: author.id, guild_id: cmd.guild_id })
			if (!userVoiceState) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.VC_REQUIRED, { username: author.username }) })
			if (queue && queue.voiceChannelID && userVoiceState.channel_id !== queue.voiceChannelID) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })

			async function createQueue() {
				queue = new queueFile(cmd.guild_id!)
				queue.lang = cmd.guild_locale ? language.getLang(cmd.guild_locale) : lang
				queue.interaction = cmd
				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							color: constants.standard_embed_color,
							description: language.replace(lang.GLOBAL.NOW_PLAYING, { "song": `[**${lang.GLOBAL.HEADER_LOADING}**](https://amanda.moe)\n\n\`[${text.progressBar(18, 60, 60, `[${lang.GLOBAL.HEADER_LOADING}]`)}]\`` })
						}
					]
				}).catch(() => void 0)
				try {
					let reject: (error?: unknown) => unknown
					const timer = setTimeout(() => reject?.("Timed out"), waitForClientVCJoinTimeout)
					const player = await new Promise<import("lavacord").Player | undefined>((resolve, rej) => {
						reject = rej
						client.lavalink!.join({ channel: userVoiceState.channel_id, guild: userVoiceState.guild_id }).then(p => {
							resolve(p)
							clearTimeout(timer)
						})
					})
					queue!.player = player
					queue!.addPlayerListeners()
					return true
				} catch (e) {
					if (e !== "Timed out") logger.error(e)
					queue!.destroy()
					queue = undefined
					client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${language.replace(lang.GLOBAL.VC_NOT_JOINABLE, { username: author.username })}\n${await text.stringify(e)}` }).catch(() => void 0)
					return false
				}
			}

			if (optionPlay !== null) {
				const node = (queue && queue.node ? common.nodes.byID(queue.node) || common.nodes.random() : common.nodes.random())
				let queueDidntExist = false

				if (!queue) {
					queueDidntExist = true
					await createQueue().catch(() => void 0)
					if (!queue) return
				}

				if (queue.voiceChannelID && queue.voiceChannelID !== userVoiceState.channel_id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })

				const tracks = await common.inputToTrack(optionPlay, cmd, lang, node.id)
				if (!tracks || !tracks.length) {
					if (queue.tracks.length === 0) queue.destroy()
					return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.NO_RESULTS })
				}

				for (const track of tracks) {
					track.queue = queue
					await queue.addTrack(track)
				}

				if (queueDidntExist) queue.play()
				else queue.interaction = cmd
				return
			} else if (optionFrisky !== null) {
				let queueDidntExist = false

				if (!queue) {
					queueDidntExist = true
					await createQueue().catch(() => void 0)
					if (!queue) return
				}

				if (queue.voiceChannelID && queue.voiceChannelID !== userVoiceState.channel_id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })

				const track = new trackTypes.FriskyTrack(optionFrisky as ConstructorParameters<typeof trackTypes.FriskyTrack>["0"])
				queue.addTrack(track)
				if (queueDidntExist) queue.play()
				else queue.interaction = cmd
				return
			} else if (optionListenmoe !== null) {
				let queueDidntExist = false

				if (!queue) {
					queueDidntExist = true
					await createQueue().catch(() => void 0)
					if (!queue) return
				}

				if (queue.voiceChannelID && queue.voiceChannelID !== userVoiceState.channel_id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content:language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })

				const track = new trackTypes.ListenMoeTrack(optionListenmoe as ConstructorParameters<typeof trackTypes.ListenMoeTrack>["0"])
				queue.addTrack(track)
				if (queueDidntExist) queue.play()
				else queue.interaction = cmd
				return
			}

			if (!queue || !queue.tracks[0]) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: author.username }) })
			if (queue.voiceChannelID && queue.voiceChannelID !== userVoiceState.channel_id && optionQueue === null) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content:language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })

			if (optionStop !== null) {
				queue.destroy()
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `Queue stopped by ${author.username}#${author.discriminator}` })
			} else if (optionAuto !== null) {
				queue.auto = optionAuto
				const state = queue.toJSON()
				if (state) websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: state.attributes } }))
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL[queue.auto ? "AUTO_ON" : "AUTO_OFF"] })
			} else if (optionInfo !== null) {
				const info = await queue.tracks[0].showInfo()
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, typeof info === "string" ? { content: info } : { embeds: [info] })
			} else if (optionLoop !== null) {
				queue.loop = optionLoop
				const state = queue.toJSON()
				if (state) websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: state.attributes } }))
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL[queue.loop ? "LOOP_ON" : "LOOP_OFF"] })
			} else if (optionLyrics !== null) {
				const lyrics = await queue.tracks[0].getLyrics()
				if (!lyrics) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Could not get track lyrics or there were no track lyrics" })
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							color: constants.standard_embed_color,
							description: `${lyrics.slice(0, 1996)}...`
						}
					]
				})
			} else if (optionNow !== null) queue.interaction = cmd
			else if (optionPause !== null) {
				queue.paused = optionPause
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Pause toggled" })
			} else if (optionPitch !== null) {
				const pitch = (2 ** (optionPitch / 12))
				queue.pitch = pitch
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `Queue pitch is now ${pitch} semitones` })
			} else if (optionQueue !== null) {
				const rows = queue.tracks.map((track, index) => `${index + 1}. ${track.queueLine}`)
				const totalLength = `\n${language.replace(lang.GLOBAL.TOTAL_LENGTH, { "length": time.prettySeconds(queue.totalDuration) })}`
				const body = `${arr.removeMiddleRows(rows, 2000 - totalLength.length).join("\n")}${totalLength}`
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							title: language.replace(lang.GLOBAL.QUEUE_FOR, { server: "this server" }),
							description: body,
							color: constants.standard_embed_color
						}
					]
				})
			} else if (optionRelated !== null) {
				const related = await queue.tracks[0].showRelated()
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, typeof related === "string" ? { content: related } : { embeds: [related] })
			} else if (optionSkip !== null) {
				queue.skip()
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Skipped that track" })
			} else if (optionSpeed !== null) {
				queue.speed = optionSpeed / 100
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `Queue speed set to ${optionSpeed}%` })
			} else if (optionVolume !== null) {
				queue.volume = optionVolume / 100
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `Queue volume set to ${optionVolume}%` })
			} else if (optionShuffle !== null) {
				const toShuffle = queue.tracks.slice(1) // Do not shuffle the first track since it's already playing
				queue.tracks.length = 1
				if (queue.voiceChannelID) await new Promise(res => websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue!.voiceChannelID, op: constants.WebsiteOPCodes.CLEAR_QUEUE } }), res))
				const shuffled = arr.shuffle(toShuffle)
				for (const track of shuffled) {
					await queue.addTrack(track)
				}
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Queue shuffled" })
			} else return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Working on re-adding. Please give me time" })
		}
	},
	{
		name: "musictoken",
		description: "Obtain a web dashboard login token",
		category: "audio",
		options: [
			{
				name: "action",
				description: "What to do",
				type: 3,
				choices: [
					{
						name: "new",
						value: "n"
					},
					{
						name: "delete",
						value: "d"
					}
				],
				required: false
			}
		],
		async process(cmd, lang) {
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5, data: { flags: 1 << 6 } })
			const action = (cmd.data?.options?.find(o => o.name === "action") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)?.value ?? null
			const author = cmd.user ? cmd.user : cmd.member!.user
			if (action === "d") {
				await orm.db.delete("web_tokens", { user_id: author.id })
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.TOKENS_DELETED, { prefix: "/" }) })
			} else if (action === "n") {
				await orm.db.delete("web_tokens", { user_id: author.id })
				const hash = crypto.randomBytes(24).toString("base64").replace(/\W/g, "_")
				await orm.db.insert("web_tokens", { user_id: author.id, token: hash, staging: 1 })
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${language.replace(lang.GLOBAL.TOKENS_NEW, { "website": `${config.website_protocol}://${config.website_domain}/dash`, "prefix": "/" })}\n${hash}` })
			} else {
				const existing = await orm.db.get("web_tokens", { user_id: author.id })
				if (existing) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${language.replace(lang.GLOBAL.TOKENS_PREVIOUS, { "prefix": "/" })}\n${existing.token}` })
				else return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.TOKENS_NONE, { "prefix": "/" }) })
			}
		}
	}
])
