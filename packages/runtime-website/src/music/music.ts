import crypto = require("crypto")

import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")
import sql = require("@amanda/sql")

import passthrough = require("../passthrough")
const { snow, commands, sync, queues, confprovider } = passthrough

const common = sync.require("./utils") as typeof import("./utils")
const trackTypes = sync.require("./tracktypes") as typeof import("./tracktypes")

import { en_us as English } from "@amanda/lang"

import {
	ComponentType,
	MessageFlags
} from "discord-api-types/v10"

const notWordRegex = /\W/g

commands.assign([
	{
		name: English.play.name,
		description: English.play.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		options: [
			{
				name: English.play.options.track.name,
				type: 3,
				description: English.play.options.track.description,
				required: true
			},
			{
				name: English.play.options.position.name,
				type: 4,
				description: English.play.options.position.description,
				required: false,
				min_value: 1
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang, true)) return

			const track = cmd.data.options.get("track")!.asString()!

			const { queue } = await common.queues.getOrCreateQueue(cmd, lang)
			if (!queue) return

			const tracks = await common.inputToTrack(track, cmd, lang, queue.node!) ?? []

			if (!tracks.length) {
				if (!queue.playHasBeenCalled) return queue.destroy(false)
				else return
			}

			const position = cmd.data.options.get("position")?.asNumber() ?? queue.tracks.length

			for (let index = 0; index < tracks.length; index++) {
				tracks[index].queue = queue
				queue.addTrack(tracks[index], position + index)
			}

			queue.interaction = cmd
		}
	},
	{
		name: English.radio.name,
		description: English.radio.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		options: [
			{
				name: English.radio.options.station.name,
				type: 3,
				description: English.radio.options.station.description,
				required: true,
				choices: [
					{ name: "random", value: "random" },
					{ name: "frisky original", value: "frisky/original" },
					{ name: "frisky deep", value: "frisky/deep" },
					{ name: "frisky chill", value: "frisky/chill" },
					{ name: "frisky classics", value: "frisky/classics" },
					{ name: "listen moe japanese", value: "listenmoe/japanese" },
					{ name: "listen moe korean", value: "listenmoe/korean" },
					{ name: "absolute chillout", value: "radionet/absolutechillout" },
					{ name: "radio swiss jazz", value: "radionet/swissjazz" },
					{ name: "yoga chill", value: "radionet/yogachill" },
					{ name: "95.7 the rock", value: "radionet/therock" },
					{ name: "classic country", value: "radionet/classiccountry" },
					{ name: "94.9 the surf", value: "radionet/thesurf" },
					{ name: "gay fm", value: "radionet/gayfm" },
					{ name: "aardvark blues", value: "radionet/aardvarkblues" }
				]
			},
			{
				name: English.radio.options.position.name,
				type: 4,
				description: English.radio.options.position.description,
				required: false,
				min_value: 1
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang, true)) return

			const track = cmd.data.options.get("station")!.asString()!

			const { queue } = await common.queues.getOrCreateQueue(cmd, lang)
			if (!queue) return

			if (track !== "random" && track.indexOf("/") === -1) throw new Error(lang.GLOBAL.NEGATIVE_1_INDEX_IN_RADIO)

			const position = cmd.data.options.get("position")?.asNumber() ?? queue.tracks.length

			queue.addTrack(
				track === "random"
					? trackTypes.RadioTrack.random(cmd.author, lang)!
					: new trackTypes.RadioTrack("!", {}, "", cmd.author, lang, track),
				position
			)

			queue.interaction = cmd
		}
	},
	{
		name: English.skip.name,
		description: English.skip.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		options: [
			{
				name: English.skip.options.start.name,
				type: 4,
				description: English.skip.options.start.description,
				required: false,
				min_value: 1
			},
			{
				name: English.skip.options.amount.name,
				type: 4,
				description: English.skip.options.amount.description,
				required: false,
				min_value: 1
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = common.queues.getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			const start = cmd.data.options.get("start")?.asNumber() ?? 1
			const amount = cmd.data.options.get("amount")?.asNumber() ?? 1

			if (queue.tracks.length < (amount - start)) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.TOO_MANY_SKIPS
				})
			} else if (start === 1 && amount === queue.tracks.length) {
				queue.destroy()
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.SKIPPED_ALL
				})
			}

			for (let index = 0; index < amount; index++) {
				await queue.removeTrack(start - 1 + index)
			}

			if (start === 1) queue.skip()

			return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: langReplace(lang.GLOBAL.SKIPPED_AMOUNT, { "amount": amount })
			})
		}
	},
	{
		name: English.stop.name,
		description: English.stop.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = common.queues.getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			queue.destroy()

			return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: langReplace(lang.GLOBAL.QUEUE_STOPPED, { "username": sharedUtils.userString(cmd.author) })
			})
		}
	},
	{
		name: English.queue.name,
		description: English.queue.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		options: [
			{
				name: English.queue.options.page.name,
				type: 4,
				description: English.queue.options.page.description,
				required: false,
				min_value: 1
			},
			{
				name: English.queue.options.volume.name,
				type: 4,
				min_value: 1,
				max_value: 500,
				description: English.queue.options.volume.description,
				required: false
			},
			{
				name: English.queue.options.loop.name,
				type: 5,
				description: English.queue.options.loop.description,
				required: false
			},
			{
				name: English.queue.options.pause.name,
				type: 5,
				description: English.queue.options.pause.description,
				required: false
			}
		],
		process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang, true)) return

			const page = cmd.data.options.get("page")?.asNumber() ?? null
			const volume = cmd.data.options.get("volume")?.asNumber() ?? null
			const loop = cmd.data.options.get("loop")?.asBoolean() ?? null
			const pause = cmd.data.options.get("pause")?.asBoolean() ?? null

			const queue = queues.get(cmd.guild_id!)

			if (!queue?.tracks[0]) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username })
				})
			}

			const userIsListening = queue.listeners.has(cmd.author.id)

			const executePage = page !== null || [volume, loop, pause].every(i => i === null)

			if (!userIsListening && !executePage) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username })
				})
			}

			if (executePage) {
				const totalLength = `\n${langReplace(lang.GLOBAL.TOTAL_LENGTH, { "length": sharedUtils.prettySeconds(queue.totalDuration) })}`
				const start = ((page ?? 1) - 1) * 10
				const sliced = queue.tracks.slice(start, start + 10)
				const strings = sliced.map((track, index) => `${index + 1}. ${track.queueLine}`)
				const body = `${strings.join("\n")}${totalLength}\n${langReplace(lang.GLOBAL.PAGE_LENGTH, { "time": sharedUtils.prettySeconds(sliced.reduce((acc, cur) => (acc + cur.lengthSeconds), 0)) })}`
				snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, {
					flags: MessageFlags.IsComponentsV2,
					components: [
						{
							type: ComponentType.Container,
							components: [
								{
									type: ComponentType.TextDisplay,
									content: lang.GLOBAL.QUEUE_FOR
								},
								{
									type: ComponentType.TextDisplay,
									content: body
								},
								{
									type: ComponentType.Separator,
								},
								{
									type: ComponentType.TextDisplay,
									content: langReplace(lang.GLOBAL.PAGE_X_OF_Y, { "current": page ?? 1, "total": Math.ceil(queue.tracks.length / 10) })
								}
							]
						}
					]
				})
			}

			if (volume !== null && userIsListening) {
				queue.volume = volume / 100
				snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.VOLUME_SET, { "volume": volume })
				})
			}

			if (loop !== null && userIsListening) {
				queue.loop = loop
				queue.sendToSubscribedSessions("onAttributesChange", queue)
				snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, {
					content: lang.GLOBAL[queue.loop ? "LOOP_ON" : "LOOP_OFF"]
				})
			}

			if (pause !== null && userIsListening) {
				queue.paused = pause
				snow.interaction.createFollowupMessage(cmd.application_id, cmd.token, {
					content: lang.GLOBAL[queue.paused ? "QUEUE_PAUSED" : "QUEUE_UNPAUSED"]
				})
			}
		}
	},
	{
		name: English.nowplaying.name,
		description: English.nowplaying.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = queues.get(cmd.guild_id!)
			if (!queue) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username })
				})
			}

			queue.interaction = cmd
		}
	},
	{
		name: English.trackinfo.name,
		description: English.trackinfo.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = queues.get(cmd.guild_id!)
			if (!queue?.tracks[0]) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username })
				})
			}

			const info = await queue.tracks[0].showInfo()

			return snow.interaction.editOriginalInteractionResponse(
				cmd.application_id,
				cmd.token,
				typeof info === "string"
					? { content: info }
					// @ts-ignore
					: { flags: MessageFlags.IsComponentsV2, components: info }
			)
		}
	},
	{
		name: English.lyrics.name,
		description: English.lyrics.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = queues.get(cmd.guild_id!)
			if (!queue) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username })
				})
			}

			const lyrics = await queue.tracks[0].getLyrics()
			if (!lyrics) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NO_LYRICS
				})
			}

			return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				// @ts-ignore
				flags: MessageFlags.IsComponentsV2,
				components: [
					{
						type: ComponentType.Container,
						components: [
							{
								type: ComponentType.TextDisplay,
								content: `${lyrics.slice(0, 1996)}...`
							}
						]
					}
				]
			})
		}
	},
	{
		name: English.seek.name,
		description: English.seek.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		options: [
			{
				name: English.seek.options.time.name,
				type: 3,
				description: English.seek.options.time.description,
				required: true
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = common.queues.getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			const timeOpt = cmd.data.options.get("time")!.asString()!

			if (!/^\d+(:\d+){0,2}$/.exec(timeOpt)) { // [[hours:]minutes:]seconds
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.INVALID_DATA_TYPE_NO_DONOR_ARBITRARY, { acceptable: "0:00" })
				})
			}

			const seconds = timeOpt.split(":").reduce((a, c, i, o) => a + +c * 60 ** (o.length - i - 1), 0)

			const result = await queue.seek(seconds * 1000)

			switch (result) {
			case 1:
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.NOTHING_PLAYING, { "username": cmd.author.username })
				})

			case 2:
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.CANNOT_SEEK_LIVE
				})

			case 3:
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.SEEK_GREATER_THAN_SONG_LENGTH
				})

			case 4:
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.SEEK_ERROR, {
						"parsed": sharedUtils.numberComma(seconds * 1000),
						"server": `${confprovider.config.website_protocol}://${confprovider.config.website_domain}/to/server`
					})
				})

			default:
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.SEEKING, { "time": sharedUtils.shortTime(seconds, "sec") })
				})
			}
		}
	},
	{
		name: English.filters.name,
		description: English.filters.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		options: [
			{
				name: English.filters.options.pitch.name,
				type: 4,
				description: English.filters.options.pitch.description,
				min_value: -7,
				max_value: 7,
				required: false
			},
			{
				name: English.filters.options.speed.name,
				type: 10,
				description: English.filters.options.speed.description,
				min_value: 0.1,
				max_value: 5.0,
				required: false
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = common.queues.getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			const pitchOption = cmd.data.options.get("pitch")?.asNumber()
			const speedOption = cmd.data.options.get("speed")?.asNumber()

			if (typeof pitchOption !== "number" && typeof speedOption !== "number") {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `${lang.filters.options.pitch.name}: ${Math.ceil(Math.log(queue.pitch) * 12 / Math.log(2))}\n${lang.filters.options.speed.name}: ${queue.speed * 100}%`
				})
			}

			const pitch = typeof pitchOption === "number" ? 2 ** (pitchOption / 12) : queue.pitch
			const speed = speedOption ? speedOption / 100 : queue.speed

			queue.pitch = pitch
			queue.speed = speed
			const result = await queue.applyFilters()

			if (!result) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.FILTERS_ERROR
				})
			} else {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.FILTERS_APPLIED
				})
			}
		}
	},
	{
		name: English.shuffle.name,
		description: English.shuffle.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = common.queues.getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			const toShuffle = queue.tracks.slice(1) // Do not shuffle the first track since it's already playing
			queue.tracks.length = 1

			queue.sendToSubscribedSessions("onClearQueue")

			const shuffled = sharedUtils.arrayShuffle(toShuffle)

			for (const track of shuffled) {
				queue.addTrack(track)
			}

			return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: lang.GLOBAL.SHUFFLED
			})
		}
	},
	{
		name: English.remove.name,
		description: English.remove.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		options: [
			{
				name: English.remove.options.index.name,
				type: 4,
				description: English.remove.options.index.description,
				required: true,
				min_value: 2
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = common.queues.getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			const indexOption = cmd.data.options.get("index")!.asNumber()!

			const track = queue.tracks[indexOption - 1]
			const result = await queue.removeTrack(indexOption - 1)

			switch (result) {
			case 1:
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.OUT_OF_BOUNDS
				})
			case 2:
				console.error("Was in Array but isn't anymore in the same tick. Did the queue tracks array somehow turn into a proxy?")
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.ERROR_OCCURRED
				})
			case 0:
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.SONG_REMOVED, { "title": track.title })
				})
			default:
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.ERROR_OCCURRED
				})
			}
		}
	},
	{
		name: English.musictoken.name,
		description: English.musictoken.description,
		category: "audio",
		integration_types: [1],
		contexts: [1],
		options: [
			{
				name: English.musictoken.options.action.name,
				description: English.musictoken.options.action.description,
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
			if (!confprovider.config.db_enabled) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			if (cmd.guild_id) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DM_ONLY
				})
			}

			const action = cmd.data.options.get("action")?.asString() ?? null

			switch (action) {
			case "d":
				await sql.orm.delete("web_tokens", { user_id: cmd.author.id })

				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.TOKENS_DELETED, { prefix: "/" })
				})

			case "n": {
				await sql.orm.delete("web_tokens", { user_id: cmd.author.id })

				const hash = crypto.randomBytes(24).toString("base64").replace(notWordRegex, "_")
				await sql.orm.insert("web_tokens", { user_id: cmd.author.id, token: hash, staging: 1 })

				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.TOKENS_NEW, {
						"website": `${confprovider.config.website_protocol}://${confprovider.config.website_domain}/dash`,
						"prefix": "/"
					})
					+ `\n${hash}`
				})
			}

			default: {
				const existing = await sql.orm.get("web_tokens", { user_id: cmd.author.id })

				if (existing) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: `${langReplace(lang.GLOBAL.TOKENS_PREVIOUS, { "prefix": "/" })}\n${existing.token}`
					})
				} else {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: langReplace(lang.GLOBAL.TOKENS_NONE, { "prefix": "/" })
					})
				}
			}
			}
		}
	},
	{
		name: English.move.name,
		description: English.move.description,
		category: "audio",
		integration_types: [0],
		contexts: [0],
		options: [
			{
				name: English.move.options.from.name,
				type: 4,
				description: English.move.options.from.description,
				required: true,
				min_value: 2
			},
			{
				name: English.move.options.to.name,
				type: 4,
				description: English.move.options.to.description,
				required: true,
				min_value: 2
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = common.queues.getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			const fromOption = cmd.data.options.get("from")!.asNumber()!
			const toOption = cmd.data.options.get("to")!.asNumber()!

			const track = queue.tracks[fromOption - 1]

			if (fromOption > queue.tracks.length || toOption > queue.tracks.length || !track) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.OUT_OF_BOUNDS
				})
			}

			await queue.removeTrack(fromOption - 1)
			queue.addTrack(track, toOption - 1)
			return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: langReplace(lang.GLOBAL.SONG_MOVED, { "title": track.title })
			})
		}
	},
	{
		name: English.search.name,
		description: English.search.description,
		category: "audio",
		integration_types: [0, 1],
		contexts: [0, 1, 2],
		options: [
			{
				name: English.search.options.input.name,
				type: 3,
				description: English.search.options.input.description,
				required: true
			},
			{
				name: English.search.options.source.name,
				type: 3,
				description: English.search.options.source.description,
				required: false,
				choices: [
					{
						name: "Spotify",
						value: "sp"
					},
					{
						name: "Apple Music",
						value: "am"
					},
					...confprovider.config.search_extra_source_options
				]
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = queues.get(cmd.guild_id!)

			const input = cmd.data.options.get("input")!.asString()!
			const source = cmd.data.options.get("source")?.asString()

			const prefix = source ? `${source}search:` : confprovider.config.lavalink_default_search_prefix

			const tracks = await common.inputToTrack(`${prefix}${input}`, cmd, lang, queue?.node, false) ?? []

			if (!tracks.length) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NO_RESULTS
				})
			}

			snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				// @ts-ignore
				flags: MessageFlags.IsComponentsV2,
				components: [
					{
						type: ComponentType.Container,
						components: [
							{
								type: ComponentType.TextDisplay,
								content: tracks
									.map(track => `[${track.author} - ${track.title}](${track.uri}) (${sharedUtils.prettySeconds(Math.round(Number(track.lengthSeconds) / 1000))})`)
									.join("\n").slice(0, 1998)
							}
						]
					}
				]
			})
		}
	}
])
