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
		if (e !== "Timed out") console.error(e)
		queue!.destroy()
		client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${language.replace(lang.GLOBAL.VC_NOT_JOINABLE, { username: cmd.author.username })}\n${await text.stringify(e)}` }).catch(() => void 0)
		return null
	}
}

async function getOrCreateQueue(cmd: import("../../modules/Command"), lang: import("@amanda/lang").Lang): Promise<{ queue: import("./queue").Queue | null; existed: boolean }> {
	let queue = queues.get(cmd.guild_id!) ?? null
	const userVoiceState = await orm.db.get("voice_states", { user_id: cmd.author.id, guild_id: cmd.guild_id! })
	if (!userVoiceState) {
		client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username }) })
		return { queue: null, existed: !!queue }
	}
	if (queue && queue.voiceChannelID && userVoiceState.channel_id !== queue.voiceChannelID) {
		client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })
		return { queue: null, existed: true }
	}
	if (queue) return { queue, existed: true }
	const node = common.nodes.byIdeal() || common.nodes.random()
	queue = await createQueue(cmd, lang, userVoiceState.channel_id, node.id).catch(() => null)
	if (!queue) return { queue: null, existed: false }
	return { queue, existed: false }
}

function doChecks(cmd: import("../../modules/Command"), lang: import("@amanda/lang").Lang) {
	if (!config.db_enabled) {
		client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "The database that allows me to track what voice channel you're in is currently not connected. This is known and a fix is being worked on" } })
		return false
	}
	if (musicDisabled) {
		client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "Working on fixing currently. This is a lot harder than people think" } })
		return false
	}
	if (!cmd.guild_id) {
		client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: lang.GLOBAL.GUILD_ONLY } })
		return false
	}
	return true
}

function getQueueWithRequiredPresence(cmd: import("../../modules/Command"), lang: import("@amanda/lang").Lang) {
	const queue = queues.get(cmd.guild_id!)
	if (!queue) {
		client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username }) } })
		return null
	}
	if (!queue.listeners.has(cmd.author.id)) {
		client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) } })
		return null
	}
	return queue
}

commands.assign([
	{
		name: "play",
		description: "Play music from multiple sources",
		category: "audio",
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
		],
		async process(cmd, lang) {
			if (!doChecks(cmd, lang)) return

			const track = cmd.data.options.get("track")!.asString()!

			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })

			const { queue, existed } = await getOrCreateQueue(cmd, lang)
			if (!queue) return
			const position = cmd.data.options.get("position")?.asNumber() ?? queue.tracks.length

			const tracks = await common.inputToTrack(track, cmd, lang, queue.node!) ?? []

			if (!tracks.length) return queue.destroy()

			for (let index = 0; index < tracks.length; index++) {
				tracks[index].queue = queue
				await queue.addTrack(tracks[index], position + index - 1)
			}

			if (!existed) queue.play()
			else queue.interaction = cmd
		}
	},
	{
		name: "radio",
		description: "Play from radio stations",
		category: "audio",
		options: [
			{
				name: "station",
				type: 3,
				description: "The station to play from",
				required: true,
				choices: [
					{ name: "frisky original", value: "frisky/original" },
					{ name: "frisky deep", value: "frisky/deep" },
					{ name: "frisky chill", value: "frisky/chill" },
					{ name: "frisky classics", value: "frisky/classics" },
					{ name: "listen moe japanese", value: "lm/jp" },
					{ name: "listen moe korean", value: "lm/kp" }
				]
			},
			{
				name: "position",
				type: 4,
				description: "1 based index to start adding tracks from",
				required: false,
				min_value: 2
			}
		],
		async process(cmd, lang) {
			if (!doChecks(cmd, lang)) return

			const track = cmd.data.options.get("station")!.asString()!

			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })

			const { queue, existed } = await getOrCreateQueue(cmd, lang)
			if (!queue) return
			const position = cmd.data.options.get("position")?.asNumber() ?? queue.tracks.length

			let toAdd: import("./tracktypes").Track

			const slashIndex = track.indexOf("/")
			if (slashIndex === -1) throw new Error("-1 index in radio")
			const namespace = track.slice(0, slashIndex)
			const value = track.slice(slashIndex + 1)

			if (namespace === "frisky") toAdd = new trackTypes.FriskyTrack(value as ConstructorParameters<typeof trackTypes.FriskyTrack>["0"], undefined, track, cmd.author)
			else if (namespace === "lm") toAdd = new trackTypes.ListenMoeTrack(value as ConstructorParameters<typeof trackTypes.ListenMoeTrack>["0"], track, cmd.author)
			else throw new Error("Invalid radio station namespace")

			await queue.addTrack(toAdd, position)

			if (!existed) queue.play()
			else queue.interaction = cmd
		}
	},
	{
		name: "skip",
		description: "Skip tracks in the queue",
		category: "audio",
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
		],
		async process(cmd, lang) {
			if (!doChecks(cmd, lang)) return
			const queue = getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })

			const start = cmd.data.options.get("start")?.asNumber() ?? 1
			const amount = cmd.data.options.get("amount")?.asNumber() ?? 1

			for (let index = 0; index < amount; index++) {
				if (start === 1) continue
				await queue.removeTrack(start + index)
			}

			if (start === 1) queue.skip()

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Skipped" })
		}
	},
	{
		name: "stop",
		description: "Stops the queue",
		category: "audio",
		process(cmd, lang) {
			if (!doChecks(cmd, lang)) return
			const queue = getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return
			queue.destroy()
			return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: `Queue stopped by ${cmd.author.username}#${cmd.author.discriminator}` } })
		}
	},
	{
		name: "queue",
		description: "Show the queue and do actions",
		category: "audio",
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
		],
		async process(cmd, lang) {
			if (!doChecks(cmd, lang)) return

			const page = cmd.data.options.get("page")?.asNumber() ?? null
			const volume = cmd.data.options.get("volume")?.asNumber() ?? null
			const loop = cmd.data.options.get("loop")?.asBoolean() ?? null
			const pause = cmd.data.options.get("pause")?.asBoolean() ?? null

			const queue = queues.get(cmd.guild_id!)

			if (!queue || !queue.tracks[0]) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type:4, data: { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username }) } })

			const userIsListening = queue.listeners.has(cmd.author.id)

			const executePage = page !== null || [volume, loop, pause].every(i => i === null)

			if (!userIsListening && !executePage) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username }) } })

			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })

			if (executePage) {
				const totalLength = `\n${language.replace(lang.GLOBAL.TOTAL_LENGTH, { "length": time.prettySeconds(queue.totalDuration) })}`
				const start = ((page || 1) - 1) * 10
				const sliced = queue.tracks.slice(start, start + 10)
				const strings = sliced.map((track, index) => `${index + 1}. ${track.queueLine}`)
				const body = `${strings.join("\n")}${totalLength}\nPage length: ${time.prettySeconds(sliced.reduce((acc, cur) => (acc + cur.lengthSeconds), 0))}`
				client.snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, {
					embeds: [
						{
							title: language.replace(lang.GLOBAL.QUEUE_FOR, { server: "this server" }),
							description: body,
							footer: {
								text: `Page ${page || 1} of ${Math.floor(queue.tracks.length / 10)}`
							},
							color: constants.standard_embed_color
						}
					]
				})
			}

			if (volume !== null && userIsListening) {
				queue.volume = volume / 100
				client.snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, { content: `Queue volume set to ${volume}%` })
			}

			if (loop !== null && userIsListening) {
				queue.loop = loop
				const state = queue.toJSON()
				if (state) websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue.voiceChannelID, op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: state.attributes } }))
				client.snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, { content: lang.GLOBAL[queue.loop ? "LOOP_ON" : "LOOP_OFF"] })
			}

			if (pause !== null && userIsListening) {
				queue.paused = pause
				client.snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, { content: "Pause toggled" })
			}
		}
	},
	{
		name: "nowplaying",
		description: "Show the queue now playing message",
		category: "audio",
		process(cmd, lang) {
			if (!doChecks(cmd, lang)) return
			const queue = queues.get(cmd.guild_id!)
			if (!queue) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username }) } })
			queue.interaction = cmd
		}
	},
	{
		name: "trackinfo",
		description: "Shows info about the currently playing track",
		category: "audio",
		async process(cmd, lang) {
			if (!doChecks(cmd, lang)) return
			const queue = queues.get(cmd.guild_id!)
			if (!queue) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username }) } })
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })
			const info = await queue.tracks[0].showInfo()
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, typeof info === "string" ? { content: info } : { embeds: [info] })
		}
	},
	{
		name: "lyrics",
		description: "Shows the lyrics of the currently playing track",
		category: "audio",
		async process(cmd, lang) {
			if (!doChecks(cmd, lang)) return
			const queue = queues.get(cmd.guild_id!)
			if (!queue) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username }) } })
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })

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
		}
	},
	{
		name: "seek",
		description: "Seek to a time in the currently playing track",
		category: "audio",
		options: [
			{
				name: "time",
				type: 4,
				description: "The time in seconds to seek in the track",
				required: true
			}
		],
		async process(cmd, lang) {
			if (!doChecks(cmd, lang)) return
			const queue = getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return
			const timeOpt = cmd.data.options.get("time")!.asNumber()!
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })
			const result = await queue.seek(timeOpt * 1000)
			if (result === 1) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.NOTHING_PLAYING, { "username": cmd.author.username }) })
			else if (result === 2) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You cannot seek live audio" })
			else if (result === 3) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "The time you provided was longer than the track's length" })
			else if (result === 4) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `There was an error with seeking to that position. Your duration was parsed properly as ${text.numberComma(timeOpt * 1000)} milliseconds, but LavaLink did not seek. This is a bug. Please report this: <${constants.server}>` })
			else return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `Seeking to ${time.shortTime(timeOpt, "sec")}. Please hold` })
		}
	},
	{
		name: "filters",
		description: "Apply filters to the queue",
		category: "audio",
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
		],
		async process(cmd, lang) {
			if (!doChecks(cmd, lang)) return
			const queue = getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return
			const pitch = cmd.data.options.get("pitch")?.asNumber() ?? queue.pitch
			const speed = cmd.data.options.get("speed")?.asNumber() ?? queue.speed
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })

			const oldFilters = queue.player!.state.filters
			const newFilters = mixin(oldFilters, { timescale: { pitch: pitch, speed: speed } })
			const result = await queue.player!.filters(newFilters)
			if (!result) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "There was an error applying the filters. The connection to the LavaLink node may have been dropped?" })
			else return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "The filters you specified are applying now. Please hold" })
		}
	},
	{
		name: "shuffle",
		description: "Shuffle the queue",
		category: "audio",
		async process(cmd, lang) {
			if (!doChecks(cmd, lang)) return
			const queue = getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return
			const toShuffle = queue.tracks.slice(1) // Do not shuffle the first track since it's already playing
			queue.tracks.length = 1
			if (queue.voiceChannelID) await new Promise(res => websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue!.voiceChannelID, op: constants.WebsiteOPCodes.CLEAR_QUEUE } }), res))
			const shuffled = arr.shuffle(toShuffle)
			for (const track of shuffled) {
				await queue.addTrack(track)
			}
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Queue shuffled" })
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
