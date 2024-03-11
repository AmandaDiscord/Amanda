import crypto = require("crypto")

import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")
import sql = require("@amanda/sql")

import passthrough = require("../passthrough")
const { snow, commands, sync, queues, confprovider, sessions, sessionGuildIndex } = passthrough

const common = sync.require("./utils") as typeof import("./utils")
const trackTypes = sync.require("./tracktypes") as typeof import("./tracktypes")

const notWordRegex = /\W/g

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
				name: "position",
				type: 4,
				description: "1 based index to start adding tracks from",
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
					: new trackTypes.RadioTrack(track, cmd.author, lang),
				position
			)

			queue.interaction = cmd
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
		name: "stop",
		description: "Stops the queue",
		category: "audio",
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
					embeds: [
						{
							title: lang.GLOBAL.QUEUE_FOR,
							description: body,
							footer: {
								text: langReplace(lang.GLOBAL.PAGE_X_OF_Y, { "current": page ?? 1, "total": Math.ceil(queue.tracks.length / 10) })
							},
							color: confprovider.config.standard_embed_color
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
				const inGuild = sessionGuildIndex.get(queue.guildID)
				inGuild?.forEach(s => sessions.get(s)!.onAttributesChange(queue))
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
		name: "nowplaying",
		description: "Show the queue now playing message",
		category: "audio",
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
		name: "trackinfo",
		description: "Shows info about the currently playing track",
		category: "audio",
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
					: { embeds: [info] }
			)
		}
	},
	{
		name: "lyrics",
		description: "Shows the lyrics of the currently playing track",
		category: "audio",
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
				embeds: [
					{
						color: confprovider.config.standard_embed_color,
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
				required: true,
				min_value: 0
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = common.queues.getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			const timeOpt = cmd.data.options.get("time")!.asNumber()!

			const result = await queue.seek(timeOpt * 1000)

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
						"parsed": sharedUtils.numberComma(timeOpt * 1000),
						"server": `${confprovider.config.website_protocol}://${confprovider.config.website_domain}/to/server`
					})
				})

			default:
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.SEEKING, { "time": sharedUtils.shortTime(timeOpt, "sec") })
				})
			}
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
				description: "Sets the pitch of the queue in semitones",
				min_value: -7,
				max_value: 7,
				required: false
			},
			{
				name: "speed",
				type: 10,
				description: "Sets the speed % of the queue",
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
		name: "shuffle",
		description: "Shuffle the queue",
		category: "audio",
		process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) return

			const queue = common.queues.getQueueWithRequiredPresence(cmd, lang)
			if (!queue) return

			const toShuffle = queue.tracks.slice(1) // Do not shuffle the first track since it's already playing
			queue.tracks.length = 1

			const inGuild = sessionGuildIndex.get(queue.guildID)
			inGuild?.forEach(s => sessions.get(s)!.onClearQueue())

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
		name: "remove",
		description: "Removes a track from the queue",
		category: "audio",
		options: [
			{
				name: "index",
				type: 4,
				description: "1 based index to start removing tracks from",
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
		name: "move",
		description: "Move a track in the queue to a new position",
		category: "audio",
		options: [
			{
				name: "from",
				type: 4,
				description: "1 based index of the track to move",
				required: true,
				min_value: 2
			},
			{
				name: "to",
				type: 4,
				description: "1 based index to move the track to",
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
		name: "search",
		description: "Search for a track from multiple sources",
		category: "audio",
		options: [
			{
				name: "input",
				type: 3,
				description: "What to search for",
				required: true
			},
			{
				name: "source",
				type: 3,
				description: "The website to use to search for the track",
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

			let tracks: Awaited<ReturnType<typeof common.loadtracks>> | undefined
			try {
				tracks = await common.loadtracks(`${prefix}${input}`, lang, queue?.node)
			} catch (e) {
				return common.handleTrackLoadError(cmd, e, input)
			}

			const mapped = common.handleTrackLoadsToArray(tracks)

			if (!mapped) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NO_RESULTS,
					embeds: []
				})
			}

			snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						color: confprovider.config.standard_embed_color,
						description: mapped
							.map(track => `[${track.info.author} - ${track.info.title}](${track.info.uri}) (${sharedUtils.prettySeconds(Math.round(Number(track.info.length) / 1000))})`)
							.join("\n").slice(0, 1998)
					}
				]
			})
		}
	}
])
