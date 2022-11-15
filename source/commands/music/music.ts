import crypto from "crypto"
import mixin from "mixin-deep"

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

const notWordRegex = /\W/g

async function createQueue(cmd: import("../../modules/Command"), lang: import("@amanda/lang").Lang, channel: string, node: string): Promise<import("./queue").Queue | null> {
	const queue = new queueFile.Queue(cmd.guild_id!)
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
		const timer = setTimeout(() => reject("Timed out"), waitForClientVCJoinTimeout)
		const player = await new Promise<import("lavacord").Player | undefined>((resolve, rej) => {
			reject = rej
			client.lavalink!.join({ channel: channel, guild: cmd.guild_id!, node }).then(p => {
				resolve(p)
				clearTimeout(timer)
			})
		})
		queue!.node = node
		queue!.player = player
		queue!.addPlayerListeners()
		return queue
	} catch (e) {
		if (e !== "Timed out") logger.error(e)
		queue!.destroy()
		client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${language.replace(lang.GLOBAL.VC_NOT_JOINABLE, { username: cmd.author.username })}\n${await text.stringify(e)}` }).catch(() => void 0)
		return null
	}
}

commands.assign([
	{
		name: "music",
		description: "The main music interface",
		category: "audio",
		options: [
			{
				name: "play",
				type: 1,
				description: "Play music from multiple sources",
				required: false,
				options: [
					{
						name: "track",
						type: 3,
						description: "The track you'd like to play",
						required: true
					},
					{
						name: "position",
						type: 4,
						description: "1 based index to start adding tracks from",
						required: false,
						min_value: 2
					}
				]
			},
			{
				name: "skip",
				type: 1,
				description: "Skip tracks in the queue",
				required: false,
				options: [
					{
						name: "start",
						type: 4,
						description: "1 based index to start skipping tracks from",
						required: false,
						min_value: 1
					},
					{
						name: "amount",
						type: 4,
						description: "The amount of tracks to skip in the queue",
						required: false,
						min_value: 1
					}
				]
			},
			{
				name: "stop",
				type: 1,
				description: "Stop the queue",
				required: false
			},
			{
				name: "queue",
				type: 1,
				description: "Shows the queue",
				required: false,
				options: [
					{
						name: "page",
						type: 4,
						description: "Choose what page in the queue to show",
						required: false,
						min_value: 1
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
						name: "pause",
						type: 5,
						description: "Sets the paused state of the queue",
						required: false
					}
				]
			},
			{
				name: "now",
				type: 1,
				description: "Show the now playing message",
				required: false
			},
			{
				name: "info",
				type: 1,
				description: "Shows the info about the current playing track",
				required: false
			},
			{
				name: "related",
				type: 1,
				description: "Shows the related tracks to the current playing track",
				required: false
			},
			{
				name: "lyrics",
				type: 1,
				description: "Shows the lyrics of the current playing track",
				required: false
			},
			{
				name: "seek",
				type: 1,
				description: "Seek to the current time in the current playing track",
				required: false,
				options: [
					{
						name: "time",
						type: 4,
						description: "The time in seconds to seek in the track",
						required: true
					}
				]
			},
			{
				name: "filters",
				type: 1,
				description: "Apply filters to the queue",
				required: false,
				options: [
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
					}
				]
			},
			{
				name: "frisky",
				type: 1,
				description: "Play music from frisky.fm radio stations",
				required: false,
				options: [
					{
						name: "station",
						type: 3,
						description: "The station to play from",
						required: true,
						choices: [
							{ name: "original", value: "original" },
							{ name: "deep", value: "deep" },
							{ name: "chill", value: "chill" },
							{ name: "classics", value: "classics" }
						]
					},
					{
						name: "position",
						type: 4,
						description: "1 based index to start adding tracks from",
						required: false,
						min_value: 2
					}
				]
			},
			{
				name: "listenmoe",
				type: 1,
				description: "Play music from listen.moe radio stations",
				required: false,
				options: [
					{
						name: "station",
						type: 3,
						description: "The station to play from",
						required: true,
						choices: [
							{ name: "jpop", value: "jp" },
							{ name: "kpop", value: "kp" }
						]
					},
					{
						name: "position",
						type: 4,
						description: "1 based index to start adding tracks from",
						required: false,
						min_value: 2
					}
				]
			},
			{
				name: "shuffle",
				type: 1,
				description: "Shuffle the queue",
				required: false
			}
		],
		async process(cmd, lang) {
			if (!config.db_enabled) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "The database that allows me to track what voice channel you're in is currently not connected. This is known and a fix is being worked on" } })
			if (musicDisabled) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "Working on fixing currently. This is a lot harder than people think" } })
			if (!cmd.guild_id) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: lang.GLOBAL.GUILD_ONLY } })

			const optionPlay = cmd.data.options.get("play") ?? null
			const optionFrisky = cmd.data.options.get("frisky") ?? null
			const optionListenmoe = cmd.data.options.get("listenmoe") ?? null
			const optionSkip = cmd.data.options.get("skip") ?? null
			const optionStop = cmd.data.options.get("stop") ?? null
			const optionQueue = cmd.data.options.get("queue") ?? null
			const optionNow = cmd.data.options.get("now") ?? null
			const optionInfo = cmd.data.options.get("info") ?? null
			const optionRelated = cmd.data.options.get("related") ?? null
			const optionLyrics = cmd.data.options.get("lyrics") ?? null
			const optionSeek = cmd.data.options.get("seek") ?? null
			const optionFilters = cmd.data.options.get("filters") ?? null
			const optionShuffle = cmd.data.options.get("shuffle") ?? null

			const array = [
				optionPlay,
				optionFrisky,
				optionListenmoe,

				optionStop,
				optionSkip,
				optionQueue,
				optionNow,
				optionInfo,
				optionRelated,
				optionLyrics,
				optionSeek,
				optionFilters,
				optionShuffle
			]

			const notNull = array.filter(i => i !== null)

			if (notNull.length === 0) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.MUSIC_INVALID_ACTION, { username: cmd.author.username, prefix: "/" }) } })
			if (notNull.length > 1) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "You can only do 1 action at a time" } })

			let queue = queues.get(cmd.guild_id) ?? null
			if (!queue && [optionPlay, optionFrisky, optionListenmoe].every(i => i === null)) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username }) } })

			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })

			if (optionPlay || optionFrisky || optionListenmoe) {
				const position = (queue ? [optionPlay, optionFrisky, optionListenmoe].find(i => i?.options.get("position"))?.asNumber() : null) ?? queue?.tracks.length ?? 1
				let queueDidntExist = false

				const userVoiceState = await orm.db.get("voice_states", { user_id: cmd.author.id, guild_id: cmd.guild_id })
				if (!userVoiceState) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username }) })
				if (queue && queue.voiceChannelID && userVoiceState.channel_id !== queue.voiceChannelID) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })

				const node = (queue && queue.node ? common.nodes.byID(queue.node) || common.nodes.byIdeal() || common.nodes.random() : common.nodes.byIdeal() || common.nodes.random())

				if (!queue) {
					queueDidntExist = true
					queue = await createQueue(cmd, lang, userVoiceState.channel_id, node.id).catch(() => null)
					if (!queue) return
				}

				const tracks = optionPlay
					? await common.inputToTrack(optionPlay.options.get("track")!.asString()!, cmd, lang, node.id) ?? []
					: optionFrisky
						? [new trackTypes.FriskyTrack(optionFrisky.options.get("station")!.asString() as ConstructorParameters<typeof trackTypes.FriskyTrack>["0"])]
						: [new trackTypes.ListenMoeTrack(optionListenmoe!.options.get("station")!.asString() as ConstructorParameters<typeof trackTypes.ListenMoeTrack>["0"])]

				if (!tracks.length) return queue.destroy()

				for (let index = 0; index < tracks.length; index++) {
					tracks[index].queue = queue
					await queue.addTrack(tracks[index], position + index)
				}

				if (queueDidntExist) queue.play()
				else queue.interaction = cmd
				return
			} else if (optionQueue) {
				if (!queue || !queue.tracks[0]) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username }) })
				const page = optionQueue.options.get("page")?.asNumber() ?? null
				const volume = optionQueue.options.get("volume")?.asNumber() ?? null
				const auto = optionQueue.options.get("auto")?.asBoolean() ?? null
				const loop = optionQueue.options.get("loop")?.asBoolean() ?? null
				const pause = optionQueue.options.get("pause")?.asBoolean() ?? null

				const executePage = page !== null || [volume, auto, loop, pause].every(i => i === null)

				if (executePage) {
					const rows = queue.tracks.map((track, index) => `${index + 1}. ${track.queueLine}`)
					const totalLength = `\n${language.replace(lang.GLOBAL.TOTAL_LENGTH, { "length": time.prettySeconds(queue.totalDuration) })}`
					const start = ((page || 1) - 1) * 10
					const body = `${rows.slice(start, start + 10).join("\n")}${totalLength}`
					client.snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, {
						embeds: [
							{
								title: language.replace(lang.GLOBAL.QUEUE_FOR, { server: "this server" }),
								description: body,
								color: constants.standard_embed_color
							}
						]
					})
				}

				const userVoiceState = await orm.db.get("voice_states", { user_id: cmd.author.id, guild_id: cmd.guild_id })
				if (!userVoiceState && !executePage) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username }) })
				if (!userVoiceState && executePage) return
				if (queue.voiceChannelID && queue.voiceChannelID !== userVoiceState.channel_id && optionQueue === null) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content:language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })

				if (volume !== null) {
					queue.volume = volume / 100
					client.snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, { content: `Queue volume set to ${volume}%` })
				}

				if (auto !== null) {
					queue.auto = auto
					const state = queue.toJSON()
					if (state) websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue.voiceChannelID, op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: state.attributes } }))
					client.snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, { content: lang.GLOBAL[queue.auto ? "AUTO_ON" : "AUTO_OFF"] })
				}

				if (loop !== null) {
					queue.loop = loop
					const state = queue.toJSON()
					if (state) websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue.voiceChannelID, op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: state.attributes } }))
					client.snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, { content: lang.GLOBAL[queue.loop ? "LOOP_ON" : "LOOP_OFF"] })
				}

				if (pause !== null) {
					queue.paused = pause
					client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Pause toggled" })
				}
				return


			}


			const userVoiceState = await orm.db.get("voice_states", { user_id: cmd.author.id, guild_id: cmd.guild_id })
			if (!userVoiceState) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username }) })

			if (!queue || !queue.tracks[0]) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username }) })
			if (queue.voiceChannelID && queue.voiceChannelID !== userVoiceState.channel_id && optionQueue === null) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content:language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })


			if (optionStop) {
				queue.destroy()
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `Queue stopped by ${cmd.author.username}#${cmd.author.discriminator}` })


			} else if (optionSkip) {
				const start = optionSkip.options.get("start")?.asNumber() ?? 1
				const amount = optionSkip.options.get("amount")?.asNumber() ?? 1

				for (let index = 0; index < amount; index++) {
					if (start === 1) continue
					await queue.removeTrack(start + index)
				}

				if (start === 1) queue.skip()

				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Skipped" })


			} else if (optionNow) queue.interaction = cmd


			else if (optionInfo) {
				const info = await queue.tracks[0].showInfo()
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, typeof info === "string" ? { content: info } : { embeds: [info] })


			} else if (optionRelated) {
				const related = await queue.tracks[0].showRelated()
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, typeof related === "string" ? { content: related } : { embeds: [related] })


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


			} else if (optionSeek) {
				const timeOpt = optionSeek.options.get("time")!.asNumber()!
				const result = await queue.seek(timeOpt)
				if (result === 1) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { "username": cmd.author.username }) })
				else if (result === 2) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You cannot seek live audio" })
				else if (result === 3) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "The time you provided was longer than the track's length" })
				else if (result === 4) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `There was an error with seeking to that position. Your duration was parsed properly as ${text.numberComma(timeOpt)} milliseconds, but LavaLink did not seek. This is a bug. Please report this: <${constants.server}>` })
				else return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `Seeking to ${time.shortTime(timeOpt, "ms")}. Please hold` })


			} else if (optionFilters) {
				const pitch = optionFilters.options.get("pitch")?.asNumber() ?? queue.pitch
				const speed = optionFilters.options.get("speed")?.asNumber() ?? queue.speed

				const oldFilters = queue.player!.state.filters
				const newFilters = mixin(oldFilters, { timescale: { pitch: pitch, speed: speed } })
				const result = await queue.player!.filters(newFilters)
				if (!result) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "There was an error applying the filters. The connection to the LavaLink node may have been dropped?" })
				else return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "The filters you specified are applying now. Please hold" })


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
			if (!config.db_enabled) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "The database is currently offline and your music token cannot be fetched. Please wait for the database to come back online" } })
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5, data: { flags: 1 << 6 } })
			const action = cmd.data.options.get("action")?.asString() ?? null
			if (action === "d") {
				await orm.db.delete("web_tokens", { user_id: cmd.author.id })
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.TOKENS_DELETED, { prefix: "/" }) })
			} else if (action === "n") {
				await orm.db.delete("web_tokens", { user_id: cmd.author.id })
				const hash = crypto.randomBytes(24).toString("base64").replace(notWordRegex, "_")
				await orm.db.insert("web_tokens", { user_id: cmd.author.id, token: hash, staging: 1 })
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${language.replace(lang.GLOBAL.TOKENS_NEW, { "website": `${config.website_protocol}://${config.website_domain}/dash`, "prefix": "/" })}\n${hash}` })
			} else {
				const existing = await orm.db.get("web_tokens", { user_id: cmd.author.id })
				if (existing) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${language.replace(lang.GLOBAL.TOKENS_PREVIOUS, { "prefix": "/" })}\n${existing.token}` })
				else return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.TOKENS_NONE, { "prefix": "/" }) })
			}
		}
	}
])
