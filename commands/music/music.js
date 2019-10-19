//@ts-check

const crypto = require("crypto")
const Discord = require("discord.js")
const path = require("path")

const passthrough = require("../../passthrough")
let {config, client, reloadEvent, reloader, commands, queueStore} = passthrough

let utils = require("../../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

let lang = require("../../modules/lang.js")
reloader.useSync("./modules/lang.js", lang)

let songTypes = require("./songtypes.js")
reloader.useSync("./commands/music/songtypes.js", songTypes)

let queueFile = require("./queue.js")
reloader.useSync("./commands/music/queue.js", queueFile)

let common = require("./common.js")
reloader.useSync("./commands/music/common.js", common)

utils.addTemporaryListener(client, "voiceStateUpdate", path.basename(__filename), (oldState, newState) => {
	// Pass on to queue for leave timeouts
	let channel = oldState.channel || newState.channel
	if (!channel || !channel.guild) return
	let queue = queueStore.get(channel.guild.id)
	if (queue) queue.voiceStateUpdate(oldState, newState)
})

/**
 * @type {Map<string, {voiceChannel?: string, queue?: string, code: (msg: Discord.Message, args: Array<string>, _: ({voiceChannel: Discord.VoiceChannel, queue: queueFile.Queue})) => any}>}
 */
const subcommandsMap = new Map([
	["play", {
		voiceChannel: "ask",
		code: async (msg, args, {voiceChannel}) => {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.command.guildOnly(msg))
			let insert = args[0][0] == "i"
			let search = args.slice(1).join(" ")
			let match = common.inputToID(search)

			const channel = msg.channel // ts is ACTUALLY stupid.

			// Linked to a video. ID may or may not work, so fall back to search.
			if (match && match.type == "video" && match.id) {
				// Get the track
				if (config.use_invidious) { // Resolve tracks with Invidious
					common.invidious.getData(match.id).then(async data => {
						// Now get the URL.
						// This can throw an error if there's no formats (i.e. video is unavailable?)
						// If it does, we'll end up in the catch block to search instead.
						let url = common.invidious.dataToURL(data)
						// The ID worked. Add the song
						let track = await common.invidious.urlToTrack(url)
						if (track) {
							let song = new songTypes.YouTubeSong(data.videoId, data.title, data.lengthSeconds, track)
							common.inserters.handleSong(song, channel, voiceChannel, insert, msg)
							return
						}
					}).catch(() => {
						// Otherwise, start a search
						common.inserters.fromSearch(channel, voiceChannel, msg.author, insert, search)
					})
				} else { // Resolve tracks with Lavalink
					common.getTracks(match.id).then(tracks => {
						if (tracks[0]) {
							// If the ID worked, add the song
							common.inserters.fromData(channel, voiceChannel, tracks[0], insert, msg)
						} else {
							throw new Error("No tracks available")
						}
					}).catch(() => {
						// Otherwise, start a search
						common.inserters.fromSearch(channel, voiceChannel, msg.author, insert, search)
					})
				}
			}

			// Linked to a playlist. `list` is set, `id` may or may not be.
			else if (match && match.type == "playlist" && match.list) {
				// Get the tracks
				let tracks = await common.getTracks(match.list)
				// Figure out what index was linked to, if any
				/** @type {number} */
				let linkedIndex = null
				if (match.id) {
					let found = tracks.findIndex(t => t.info.identifier == match.id)
					if (found != -1) linkedIndex = found
				}
				// We have linkedIndex. Now what to do with it?
				if (linkedIndex == null || args[2]) {
					// User knows they linked a playlist.
					tracks = utils.playlistSection(tracks, args[2], args[3], false)
					common.inserters.fromDataArray(msg.channel, voiceChannel, tracks, insert, msg)
				}
				else {
					// A specific video was linked and a section was not specified, user may want to choose what to play.
					// linkedIndex is definitely specified here.
					// Define options
					let buttons = [
						"<:bn_1:327896448232325130>",
						"<:bn_2:327896448505217037>",
						"<:bn_3:327896452363976704>"
					]
					let options = [
						"Play the entire playlist from the start",
						"Play the playlist, starting at the linked song",
						"Only play the linked song"
					]
					// Make an embed
					let embed = new Discord.MessageEmbed()
					.setTitle("Playlist section")
					.setColor(0x36393f)
					.setDescription(
						`You linked to this song in the playlist: **${Discord.Util.escapeMarkdown(tracks[linkedIndex].info.title)}**`
						+"\nWhat would you like to do?"
						+options.map((o, i) => `\n${buttons[i]} ${o}`).join("")
						+"\nTo play a more specific range from the playlist, use `&music play <link> <start> <end>`. See `&help playlist` for more information."
					)
					// Send the embed
					let nmsg = await msg.channel.send(embed)
					// Make the base reaction menu action
					let action = {ignore: "total", remove: "all", actionType: "js", actionData: (msg, emoji, user) => {
						// User made a choice
						/** Zero-indexed emoji choice */
						let choice = emoji.name[3]-1
						// Edit the message to reflect the choice
						embed.setDescription("» "+options[choice])
						nmsg.edit(embed)
						// Now obey that choice
						if (choice == 0) {
							// choice == 0: play full playlist
							common.inserters.fromDataArray(msg.channel, voiceChannel, tracks, insert)
						} else if (choice == 1) {
							// choice == 1: play from linked item
							tracks = tracks.slice(linkedIndex)
							common.inserters.fromDataArray(msg.channel, voiceChannel, tracks, insert)
						} else if (choice == 2) {
							// choice == 2: play linked item only
							common.inserters.fromData(msg.channel, voiceChannel, tracks[linkedIndex], insert)
						}
					}}
					// Create the reaction menu
					utils.reactionMenu(nmsg, Array(3).fill(undefined).map((_, i) => {
						let emoji = buttons[i].slice(2, -1)
						return Object.assign({emoji}, action)
					}))
				}
			}

			// User input wasn't a playlist and wasn't a video. Start a search.
			else {
				common.inserters.fromSearch(msg.channel, voiceChannel, msg.author, insert, search)
			}
		}
	}],
	["stop", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			queue.wrapper.stop()
		}
	}],
	["queue", {
		queue: "required",
		code: async (msg, args, {queue}) => {
			if (args[1] == "empty" || args[1] == "clear" || (args[1] == "remove" && args[2] == "all")) {
				let numberOfSongs = queue.songs.length-1
				for (let i = queue.songs.length-1; i >= 1; i--) {
					queue.removeSong(i, true)
				}
				msg.channel.send(`Cleared the queue, removing ${numberOfSongs} ${numberOfSongs == 1 ? "song" : "songs"}.`)
			} else if (args[1] == "r" || args[1] == "remove") {
				let index = +args[2]
				queue.wrapper.removeSong(index, msg)
			} else {
				let rows = queue.songs.map((song, index) => `${index+1}. `+song.queueLine)
				let totalLength = "\nTotal length: "+common.prettySeconds(queue.getTotalLength())
				let body = utils.compactRows.removeMiddle(rows, 2000-totalLength.length).join("\n") + totalLength
				msg.channel.send(
					new Discord.MessageEmbed()
					.setTitle(`Queue for ${Discord.Util.escapeMarkdown(msg.guild.name)}`)
					.setDescription(body)
					.setColor(0x36393f)
				)
			}
		}
	}],
	["skip", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			let amount
			if (args[1]) {
				amount = Math.floor(Number(args[1]))
				if (isNaN(amount)) return msg.channel.send(`That is not a valid amount of songs to skip`)
				if (amount < 1) return msg.channel.send(`You have to skip 1 or more songs`)
				if (queue.songs.length < amount) return msg.channel.send(`You cannot skip more songs than are in the queue!`)
				if (queue.songs.length == amount) return queue.wrapper.stop()
			}
			queue.wrapper.skip(amount)
		}
	}],
	["auto", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			queue.wrapper.toggleAuto(msg)
		}
	}],
	["now", {
		queue: "required",
		code: async (msg, args, {queue}) => {
			if (msg.channel.id == queue.textChannel.id) {
				queue.sendNewNP(true)
			} else {
				msg.channel.send(`The current music session is over in ${queue.textChannel}. Go there to see what's playing!`)
			}
		}
	}],
	["info", {
		queue: "required",
		code: async (msg, args, {queue}) => {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.command.guildOnly(msg))
			queue.wrapper.showInfo(msg.channel)
		}
	}],
	["pause", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			queue.wrapper.pause(msg)
		}
	}],
	["resume", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			queue.wrapper.resume(msg)
		}
	}],
	["related", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.command.guildOnly(msg))
			if (args[1] == "play" || args[1] == "insert" || args[1] == "p" || args[1] == "i") {
				let insert = args[1][0] == "i"
				let index = +args[2]
				queue.wrapper.playRelated(index, insert, msg)
			} else {
				queue.wrapper.showRelated(msg.channel)
			}
		}
	}],
	["playlist", {
		voiceChannel: "provide",
		code: async (msg, args, {voiceChannel}) => {
			if (commands.has("playlist")) {
				let suffix = args.slice(1).join(" ")
				let command = commands.get("playlist")
				return command.process(msg, suffix)
			} else {
				throw new Error("Playlist command not loaded")
			}
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
	["playlists", "playlist"]
])
for (let key of subcommandsMap.keys()) {
	subcommandAliasMap.set(key, key)
}

commands.assign({
	"musictoken": {
		usage: "[new|delete]",
		description: "Obtain a web dashboard login token",
		aliases: ["token", "musictoken", "webtoken", "musictokens", "webtokens"],
		category: "meta",
		process: async function(msg, suffix) {
			if (suffix == "delete") {
				await deleteAll()
				msg.author.send("Deleted all your tokens. Use `&musictoken new` to generate a new one.")
			} else if (suffix == "new") {
				await deleteAll()
				let hash = crypto.randomBytes(24).toString("base64").replace(/\W/g, "_")
				await utils.sql.all("INSERT INTO WebTokens VALUES (?, ?, ?)", [msg.author.id, hash, 1])
				send(
					`Your existing tokens were deleted, and a new one was created.`
					+"\nDo not share this token with anyone. If you do accidentally share it, you can use `&musictoken delete` to delete it and keep you safe."
					+`\nYou can now log in! ${config.website_protocol}://${config.website_domain}/dash`
					,true, true
				).then(() => {
					return send("`"+hash+"`", false, false)
				}).catch(() => {})
			} else {
				let existing = await utils.sql.get("SELECT * FROM WebTokens WHERE userID = ?", msg.author.id)
				if (existing) {
					send(
						"Here is the token you generated previously:"
						+"\nYou can use `&musictoken delete` to delete it, and `&musictoken new` to regenerate it."
						,true, true
					).then(() => {
						send("`"+existing.token+"`", false, false)
					}).catch(() => {})
				} else {
					send("You do not currently have any tokens. Use `&musictoken new` to generate a new one.")
				}
			}

			function deleteAll() {
				return utils.sql.all("DELETE FROM WebTokens WHERE userID = ?", msg.author.id)
			}

			function send(text, announce = true, throwFailed = false) {
				return msg.author.send(text).then(() => {
					if (msg.channel.type == "text" && announce) msg.channel.send(lang.dm.success(msg))
				}).catch(() => {
					if (announce) msg.channel.send(lang.dm.failed(msg))
					if (throwFailed) throw new Error("DM failed")
				})
			}
		}
	},
	"frisky": {
		usage: "[frisky|deep|chill|classics]",
		description: "Play Frisky Radio: https://friskyradio.com",
		aliases: ["frisky"],
		category: "audio",
		process: async function(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.command.guildOnly(msg))
			let voiceChannel = await common.detectVoiceChannel(msg, true)
			if (!voiceChannel) return
			if (suffix == "classic") suffix = "classics" // alias
			let station = ["frisky", "deep", "chill", "classics"].includes(suffix) ? suffix : "frisky"
			let song = new songTypes.FriskySong(station)
			return common.inserters.handleSong(song, msg.channel, voiceChannel, false, msg)
		}
	},
	"music": {
		usage: "none",
		description: "Play music from YouTube",
		aliases: ["music", "m"],
		category: "audio",
		process: async function(msg, suffix) {
			// No DMs
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.command.guildOnly(msg))
			// Args
			let args = suffix.split(" ")
			// Find subcommand
			let subcommand = args[0] ? args[0].trim().toLowerCase() : ""
			let key = subcommandAliasMap.get(subcommand)
			let subcommandObject = subcommandsMap.get(key)
			if (!subcommandObject) return msg.channel.send(lang.input.music.invalidAction(msg))
			// Create data for subcommand
			let subcommmandData = {}
			// Provide a queue?
			if (subcommandObject.queue == "required") {
				let queue = queueStore.get(msg.guild.id)
				if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg))
				subcommmandData.queue = queue
			}
			// Provide a voice channel?
			if (subcommandObject.voiceChannel) {
				if (subcommandObject.voiceChannel == "required") {
					let voiceChannel = await common.detectVoiceChannel(msg, false)
					if (!voiceChannel) return
					subcommmandData.voiceChannel = voiceChannel
				} else if (subcommandObject.voiceChannel == "ask") {
					let voiceChannel = await common.detectVoiceChannel(msg, true)
					if (!voiceChannel) return
					subcommmandData.voiceChannel = voiceChannel
				} else if (subcommandObject.voiceChannel == "provide") {
					let voiceChannel = msg.member.voice.channel
					subcommmandData.voiceChannel = voiceChannel
				}
			}
			// Hand over execution to the subcommand
			subcommandObject.code(msg, args, subcommmandData)
		}
	}
})
