/* eslint-disable no-irregular-whitespace */
// @ts-check

const crypto = require("crypto")
const Discord = require("discord.js")
const path = require("path")

const passthrough = require("../../passthrough")
const { config, client, reloader, commands, queues, frisky } = passthrough

const utils = require("../../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

const songTypes = require("./songtypes.js")
reloader.useSync("./commands/music/songtypes.js", songTypes)

const queueFile = require("./queue.js")
reloader.useSync("./commands/music/queue.js", queueFile)

const common = require("./common.js")
reloader.useSync("./commands/music/common.js", common)

utils.addTemporaryListener(client, "voiceStateUpdate", path.basename(__filename), (oldState, newState) => {
	// Pass on to queue for leave timeouts
	const channel = oldState.channel || newState.channel
	if (!channel || !channel.guild) return
	const queue = queues.cache.get(channel.guild.id)
	if (queue) queue.voiceStateUpdate(oldState, newState)
})

/**
 * @type {Map<string, {voiceChannel?: string, queue?: string, code: (msg: Discord.Message, args: Array<string>, _: ({voiceChannel: Discord.VoiceChannel, queue: queueFile.Queue, lang: import("@amanda/lang").Lang})) => any}>}
 */
const subcommandsMap = new Map([
	["play", {
		voiceChannel: "ask",
		code: async (msg, args, { voiceChannel, lang }) => {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.audio.music.prompts.guildOnly)
			const insert = args[0][0] == "i"
			const search = args.slice(1).join(" ")
			const match = common.inputToID(search)

			const channel = msg.channel // ts is ACTUALLY stupid.

			// Linked to a video. ID may or may not work, so fall back to search.
			if (match && match.type == "video" && match.id) {
				// Get the track
				if (config.use_invidious) { // Resolve tracks with Invidious
					const queue = queues.cache.get(msg.guild.id)
					const node = (queue && queue.getUsedLavalinkNode()) || utils.getLavalinkNodeByRegion(msg.guild.region)
					common.invidious.getData(match.id, node.host).then(async data => {
						// Now get the URL.
						// This can throw an error if there's no formats (i.e. video is unavailable?)
						// If it does, we'll end up in the catch block to search instead.
						const url = common.invidious.dataToURL(data)
						// The ID worked. Add the song
						const track = await common.invidious.urlToTrack(url, voiceChannel.guild.region)
						if (track) {
							const song = new songTypes.YouTubeSong(data.videoId, data.title, data.lengthSeconds, track)
							common.inserters.handleSong(song, channel, voiceChannel, insert, msg)
							return
						}
					}).catch(() => {
						// Otherwise, start a search
						common.inserters.fromSearch(channel, voiceChannel, msg.author, insert, search, lang)
					})
				} else { // Resolve tracks with Lavalink
					common.getTracks(match.id, voiceChannel.guild.region).then(tracks => {
						if (tracks[0]) {
							// If the ID worked, add the song
							common.inserters.fromData(channel, voiceChannel, tracks[0], insert, msg)
						} else throw new Error("No tracks available")
					}).catch(() => {
						// Otherwise, start a search
						common.inserters.fromSearch(channel, voiceChannel, msg.author, insert, search, lang)
					})
				}
			} else if (match && match.type == "playlist" && match.list) { // Linked to a playlist. `list` is set, `id` may or may not be.
				// Get the tracks
				let tracks = await common.getTracks(match.list, voiceChannel.guild.region)
				// Figure out what index was linked to, if any
				/** @type {number} */
				let linkedIndex = null
				if (match.id) {
					const found = tracks.findIndex(t => t.info.identifier == match.id)
					if (found != -1) linkedIndex = found
				}
				// We have linkedIndex. Now what to do with it?
				if (linkedIndex == null || args[2]) {
					// User knows they linked a playlist.
					tracks = utils.playlistSection(tracks, args[2], args[3], false)
					common.inserters.fromDataArray(msg.channel, voiceChannel, tracks, insert, msg)
				} else {
					// A specific video was linked and a section was not specified, user may want to choose what to play.
					// linkedIndex is definitely specified here.
					// Define options
					const buttons = [
						"<:bn_1:327896448232325130>",
						"<:bn_2:327896448505217037>",
						"<:bn_3:327896452363976704>"
					]
					const options = [
						lang.audio.playlist.prompts.playFromStart,
						lang.audio.playlist.prompts.playFromLinked,
						lang.audio.playlist.prompts.playOnlyLinked
					]
					// Make an embed
					const embed = new Discord.MessageEmbed()
						.setTitle(lang.audio.playlist.prompts.playlistSection)
						.setColor(0x36393f)
						.setDescription(
							utils.replace(lang.audio.playlist.prompts.userLinked, { "title": `**${Discord.Util.escapeMarkdown(tracks[linkedIndex].info.title)}**` })
						+ `\n${lang.audio.playlist.prompts.query}`
						+ options.map((o, i) => `\n${buttons[i]} ${o}`).join("")
						+ `\n${lang.audio.playlist.prompts.selectionInfo}`
						)
					// Send the embed
					const nmsg = await msg.channel.send(embed)
					// Make the base reaction menu action
					const action = { ignore: "total", remove: "all", actionType: "js", actionData: (message, emoji, user) => {
						// User made a choice
						/** Zero-indexed emoji choice */
						const choice = emoji.name[3] - 1
						// Edit the message to reflect the choice
						embed.setDescription(`» ${options[choice]}`)
						nmsg.edit(embed)
						// Now obey that choice
						if (choice == 0) {
							// choice == 0: play full playlist
							common.inserters.fromDataArray(message.channel, voiceChannel, tracks, insert)
						} else if (choice == 1) {
							// choice == 1: play from linked item
							tracks = tracks.slice(linkedIndex)
							common.inserters.fromDataArray(message.channel, voiceChannel, tracks, insert)
						} else if (choice == 2) {
							// choice == 2: play linked item only
							common.inserters.fromData(message.channel, voiceChannel, tracks[linkedIndex], insert)
						}
					} }
					// Create the reaction menu
					utils.reactionMenu(nmsg, Array(3).fill(undefined).map((_, i) => {
						const emoji = buttons[i].slice(2, -1)
						return Object.assign({ emoji }, action)
					}))
				}
			} else common.inserters.fromSearch(msg.channel, voiceChannel, msg.author, insert, search, lang) // User input wasn't a playlist and wasn't a video. Start a search.
		}
	}],
	["stop", {
		voiceChannel: "required",
		queue: "required",
		code: (msg, args, { queue }) => {
			queue.wrapper.stop()
		}
	}],
	["queue", {
		queue: "required",
		code: (msg, args, { queue, lang }) => {
			if (args[1] == "empty" || args[1] == "clear" || (args[1] == "remove" && args[2] == "all")) {
				queue.wrapper.removeAllSongs({ msg, lang })
			} else if (args[1] == "r" || args[1] == "remove") {
				const index = +args[2]
				queue.wrapper.removeSong(index, msg)
			} else {
				const rows = queue.songs.map((song, index) => `${index + 1}. ${song.queueLine}`)
				const totalLength = `\n${utils.replace(lang.audio.music.prompts.totalLength, { "number": common.prettySeconds(queue.getTotalLength()) })}`
				const body = `${utils.compactRows.removeMiddle(rows, 2000 - totalLength.length).join("\n")}${totalLength}`
				msg.channel.send(
					new Discord.MessageEmbed()
						.setTitle(utils.replace(lang.audio.music.prompts.queueFor, { "server": Discord.Util.escapeMarkdown(msg.guild.name) }))
						.setDescription(body)
						.setColor(0x36393f)
				)
			}
		}
	}],
	["skip", {
		voiceChannel: "required",
		queue: "required",
		code: (msg, args, { queue, lang }) => {
			let amount
			if (args[1]) {
				amount = Math.floor(Number(args[1]))
				if (isNaN(amount)) return msg.channel.send(lang.audio.music.prompts.invalidSkips)
				if (amount < 1) return msg.channel.send(lang.audio.music.prompts.invalidSkipsAmount)
				if (queue.songs.length < amount) return msg.channel.send(lang.audio.music.prompts.tooManySkips)
				if (queue.songs.length == amount) return queue.wrapper.stop()
			}
			queue.wrapper.skip(amount)
		}
	}],
	["auto", {
		voiceChannel: "required",
		queue: "required",
		code: (msg, args, { queue }) => {
			queue.wrapper.toggleAuto(msg)
		}
	}],
	["loop", {
		voiceChannel: "required",
		queue: "required",
		code: (msg, args, { queue }) => {
			queue.wrapper.toggleLoop(msg)
		}
	}],
	["now", {
		queue: "required",
		code: (msg, args, { queue, lang }) => {
			if (msg.channel.id == queue.textChannel.id) queue.sendNewNP(true)
			else msg.channel.send(utils.replace(lang.audio.music.returns.queueIn, { "channel": `<#${queue.textChannel.id}>` }))
		}
	}],
	["info", {
		queue: "required",
		code: (msg, args, { queue, lang }) => {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.audio.music.prompts.guildOnly)
			queue.wrapper.showInfo(msg.channel)
		}
	}],
	["pause", {
		voiceChannel: "required",
		queue: "required",
		code: (msg, args, { queue }) => {
			queue.wrapper.pause(msg)
		}
	}],
	["resume", {
		voiceChannel: "required",
		queue: "required",
		code: (msg, args, { queue }) => {
			queue.wrapper.resume(msg)
		}
	}],
	["related", {
		voiceChannel: "required",
		queue: "required",
		code: (msg, args, { queue, lang }) => {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.audio.music.prompts.guildOnly)
			if (args[1] == "play" || args[1] == "insert" || args[1] == "p" || args[1] == "i") {
				const insert = args[1][0] == "i"
				const index = +args[2]
				queue.wrapper.playRelated(index, insert, msg)
			} else queue.wrapper.showRelated(msg.channel)
		}
	}],
	["playlist", {
		voiceChannel: "provide",
		code: (msg, args, { voiceChannel, lang }) => {
			if (commands.cache.has("playlist")) {
				const suffix = args.slice(1).join(" ")
				const command = commands.cache.get("playlist")
				return command.process(msg, suffix, lang)
			} else throw new Error("Playlist command not loaded")
		}
	}]
])

// left side is user input, right side is mapped subcommand
const subcommandAliasMap = new Map([
	["p", "play"],
	["i", "play"],
	["insert", "play"],
	["q", "queue"],
	["s", "skip"],
	["n", "now"],
	["rel", "related"],
	["pl", "playlist"],
	["playlists", "playlist"],
	["repeat", "loop"],
	["l", "loop"]
])
for (const key of subcommandsMap.keys()) subcommandAliasMap.set(key, key)

commands.assign([
	{
		usage: "[new|delete]",
		description: "Obtain a web dashboard login token",
		aliases: ["token", "musictoken", "webtoken", "musictokens", "webtokens"],
		category: "meta",
		example: "&token new",
		async process(msg, suffix, lang) {
			if (suffix == "delete") {
				await deleteAll()
				msg.author.send(lang.audio.token.returns.deleted)
			} else if (suffix == "new") {
				await deleteAll()
				const hash = crypto.randomBytes(24).toString("base64").replace(/\W/g, "_")
				await utils.sql.all("INSERT INTO WebTokens VALUES (?, ?, ?)", [msg.author.id, hash, 1])
				send(utils.replace(lang.audio.token.returns.new, { "website": `${config.website_protocol}://${config.website_domain}/dash` }), true, true
				).then(() => {
					return send(`\`${hash}\``, false, false)
				// eslint-disable-next-line no-empty-function
				}).catch(() => {})
			} else {
				const existing = await utils.sql.get("SELECT * FROM WebTokens WHERE userID = ?", msg.author.id)
				if (existing) {
					send(lang.audio.token.returns.generated, true, true).then(() => {
						send(`\`${existing.token}\``, false, false)
					// eslint-disable-next-line no-empty-function
					}).catch(() => {})
				} else send(lang.audio.token.prompts.none)
			}

			function deleteAll() {
				return utils.sql.all("DELETE FROM WebTokens WHERE userID = ?", msg.author.id)
			}

			function send(text, announce = true, throwFailed = false) {
				return msg.author.send(text).then(() => {
					if (msg.channel.type == "text" && announce) msg.channel.send(lang.audio.token.returns.dmSuccess)
				}).catch(() => {
					if (announce) msg.channel.send(lang.audio.token.prompts.dmFailed)
					if (throwFailed) throw new Error("DM failed")
				})
			}
		}
	},
	{
		usage: "[Channel]",
		description: "Provides debugging information for if audio commands are not working as intended",
		aliases: ["debug"],
		category: "audio",
		example: "&debug general",
		async process(msg, suffix, lang) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.audio.debug.prompts.guildOnly)
			const channel = await utils.findChannel(msg, suffix, true)
			if (!channel) return msg.channel.send(lang.audio.debug.prompts.invalidChannel)
			const types = {
				text: [["Read Messages", "VIEW_CHANNEL"], ["Read Message History", "READ_MESSAGE_HISTORY"], ["Send Messages", "SEND_MESSAGES"], ["Embed Content", "EMBED_LINKS"], ["Add Reactions", "ADD_REACTIONS"]],
				voice: [["View Channel", "VIEW_CHANNEL"], ["Join", "CONNECT"], ["Speak", "SPEAK"]]
			}
			/** @type {Array<[string, Discord.BitFieldResolvable<Discord.PermissionString>]>} */
			// @ts-ignore
			const perms = channel.type == "text" ? types.text : types.voice
			const permissions = channel.permissionsFor(client.user)
			const emoji = channel.type == "text" ? "674569797278892032" : "674569797278760961"
			const node = utils.getLavalinkNodeByRegion(msg.guild.region)
			let extraNodeInfo = ""
			const currentQueue = queues.cache.get(msg.guild.id)
			const currentQueueNode = currentQueue && currentQueue.getUsedLavalinkNode()
			if (currentQueueNode && currentQueueNode !== node) {
				const name = currentQueueNode ? currentQueueNode.name : lang.audio.debug.returns.unnamedNode
				extraNodeInfo = `\n↳ ${utils.replace(lang.audio.debug.returns.queueUsing, { "name": name })}`
			}
			const invidiousHostname = new URL(common.invidious.getOrigin((currentQueueNode || node).host)).hostname
			const details = new Discord.MessageEmbed()
				.setColor(0x36393f)
				.setAuthor(utils.replace(lang.audio.debug.returns.infoFor, { "channel": channel.name }), utils.emojiURL(emoji))
				.addField(lang.audio.debug.returns.permissions, perms.map(item => `${item[0]}: ${permissions.has(item[1])}`).join("\n"))
				.addField("Player:",
					`${lang.audio.debug.returns.method} ${config.use_invidious ? "Invidious" : "LavaLink"}`
					+ `\nLavaLink Node: ${node.name}`
					+ extraNodeInfo
					+ `\nInvidious Domain: ${invidiousHostname}`
				)
			if (channel.type === "text") details.addFields({ name: lang.audio.debug.returns.tip, value: lang.audio.debug.returns.tipValue })
			return msg.channel.send(utils.contentify(msg.channel, details))
		}
	},
	{
		usage: "[original|deep|chill|classics]",
		description: "Play Frisky Radio: https://friskyradio.com",
		aliases: ["frisky"],
		category: "audio",
		example: "&frisky chill",
		async process(msg, suffix, lang) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.audio.music.prompts.guildOnly)
			if (suffix === "classic") suffix = "classics" // alias
			if (suffix === "originals") suffix = "original" // alias
			if (["original", "deep", "chill", "classics"].includes(suffix)) { // valid station?
				const voiceChannel = await common.detectVoiceChannel(msg, true, lang)
				if (!voiceChannel) return
				const song = new songTypes.FriskySong(suffix)
				return common.inserters.handleSong(song, msg.channel, voiceChannel, false, msg)
			} else { // show overview
				/*
					**`Chill    `**     `ɴᴏᴡ →`  [Zero Gravity](https://beta.frisky.fm/mix/48428) (Nov)
					\_\_\_\_\_\_\_\_\_\_      ` 34m `  [Extents](https://beta.frisky.fm/mix/44871) (Feb)
					spacing without underscores: >​                           ​<
					**`Classics `**     `ɴᴏᴡ →`  [Sextronic](https://beta.frisky.fm/mix/21336) (Jun 2013)
					\_\_\_\_\_\_\_\_\_\_      `  1h `  [Floorjam](https://beta.frisky.fm/mix/24433) (Mar 2014)
				*/

				// eslint-disable-next-line no-inner-declarations
				function makeZWSP(length) {
					return Array(length).fill(" ").join("​") // SC: U+200B zero-width space
				}

				/** @type {import("frisky-client/lib/StreamManager")} */ // type detection PLEASE
				frisky.managers.stream
				const stations = frisky.managers.stream.stations
				// first column
				const stationNameLength = 9
				const stationPostSpacing = makeZWSP(2)
				const underscores = `\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_${makeZWSP(2)} ` // SC: U+2005 four-per-em space
				const spacing = makeZWSP(25)
				// second column
				const timePadding = 4 // does not include spaces on right
				const timeSpacingRight = " "
				const timePostSpacing = makeZWSP(2)

				const descriptionLines = new Map()
				// for each station
				for (const stationName of frisky.managers.stream.stations.keys()) {
					// set up constants
					const station = stations.get(stationName)
					const index = station.findNowPlayingIndex()
					const schedule = station.getSchedule()
					const availableCount = schedule.length - index
					const willUseCount = Math.min(availableCount, 3)
					descriptionLines.set(stationName, [])

					// for each stream
					for (let i = index; i < index + willUseCount; i++) {
						const stream = schedule[i]
						if (stream.mix && stream.mix.data) { // ignore streams that don't have a loaded mix
							// add the time
							const timeUntil = stream.getTimeUntil()
							let item = ""
							if (timeUntil <= 0) { // now playing
								item += "`ɴᴏᴡ →`"
							} else { // show time until
								let timeString = ""
								if (timeUntil < 1000 * 60 * 60) { // less than one hour, so scale to minutes
									timeString = `${Math.floor(timeUntil / 1000 / 60)}m`
								} else { // more than one hour, so scale to hours
									timeString = `${Math.floor(timeUntil / 1000 / 60 / 60)}h`
								}
								item += `\`${timeString.padStart(timePadding) + timeSpacingRight}\``
							}
							item += timePostSpacing

							// add the name and date
							const title = stream.mix.data.title // inFlowmotion - August 2019 - DepGlobe
							const [name, dateString] = title.split(" - ")
							const date = new Date(`${dateString} UTC`)
							let displayDate = date.toUTCString().split(" ")[2] // extract month
							if (date.getUTCFullYear() !== new Date().getUTCFullYear()) { // different year, so should also display year
								displayDate += " " + date.getUTCFullYear()
							}
							item += `[${name}](https://beta.frisky.fm/mix/${stream.mix.data.id}) (${displayDate})`

							// item is prepared, add it to the description
							descriptionLines.get(stationName).push(item)
						}
					} // end stream loop
				} // end station loop

				// turn lines into actual description
				let description = ""
				for (const stationName of descriptionLines.keys()) {
					const stationDisplayName = stationName === "frisky" ? "original" : stationName
					const lines = descriptionLines.get(stationName)
					for (let i = 0; i < lines.length; i++) {
						const line = lines[i]
						if (i === 0) description += `**\`${stationDisplayName.padEnd(stationNameLength)}\`**${stationPostSpacing}`
						// last: underscores
						else if (i === lines.length - 1) description += underscores
						// middle: space
						else {
							description += spacing
						}
						description += `${line}\n`
					}
				}
				description = description.slice(0, -1) // cut off final newline

				msg.channel.send(
					new Discord.MessageEmbed()
						.setColor(0x36393f)
						.setTitle(lang.audio.frisky.returns.schedule)
						.setDescription(description)
						.setFooter(lang.audio.frisky.returns.footer)
				)
			}
		}
	},
	{
		usage: "none",
		description: "Play music from YouTube",
		aliases: ["music", "m"],
		category: "audio",
		async process(msg, suffix, lang) {
			// No DMs
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.audio.music.prompts.guildOnly)
			// Args
			const args = suffix.split(" ")
			// Find subcommand
			const subcommand = args[0] ? args[0].trim().toLowerCase() : ""
			const key = subcommandAliasMap.get(subcommand)
			const subcommandObject = subcommandsMap.get(key)
			if (!subcommandObject) return msg.channel.send(utils.replace(lang.audio.music.prompts.invalidAction, { "username": msg.author.username }))
			// Create data for subcommand
			const subcommmandData = {}
			subcommmandData.lang = lang
			// Provide a queue?
			if (subcommandObject.queue == "required") {
				const queue = queues.cache.get(msg.guild.id)
				if (!queue) return msg.channel.send(utils.replace(lang.audio.music.prompts.nothingPlaying, { "username": msg.author.username }))
				subcommmandData.queue = queue
			}
			// Provide a voice channel?
			if (subcommandObject.voiceChannel) {
				if (subcommandObject.voiceChannel == "required") {
					const voiceChannel = await common.detectVoiceChannel(msg, false, lang)
					if (!voiceChannel) return
					subcommmandData.voiceChannel = voiceChannel
				} else if (subcommandObject.voiceChannel == "ask") {
					const voiceChannel = await common.detectVoiceChannel(msg, true, lang)
					if (!voiceChannel) return
					subcommmandData.voiceChannel = voiceChannel
				} else if (subcommandObject.voiceChannel == "provide") {
					const voiceChannel = msg.member.voice.channel
					subcommmandData.voiceChannel = voiceChannel
				}
			}
			// Hand over execution to the subcommand
			subcommandObject.code(msg, args, subcommmandData)
		}
	}
])
