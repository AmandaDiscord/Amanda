import Discord from "thunderstorm"
import encoding from "@lavalink/encoding"

import passthrough from "../../passthrough"
const { commands, constants, sync, queues, voiceStateTriggers } = passthrough

const common = sync.require("./utils") as typeof import("./utils")
const songTypes = sync.require("./songtypes") as typeof import("./songtypes")
const queueFile = sync.require("./queue") as typeof import("./queue")

const orm = sync.require("../../utils/orm") as typeof import("../../utils/orm")
const language = sync.require("../../utils/language") as typeof import("../../utils/language")
const text = sync.require("../../utils/string") as typeof import("../../utils/string")

const waitForClientVCJoinTimeout = 5000

const musicDisabled = true as boolean

commands.assign([
	{
		name: "music",
		description: "The main music interface",
		category: "audio",
		options: [
			{
				name: "play",
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
				description: "Play music. You can prepend ids to choose the site to search. e.g: yt:despacito or sc:despacito",
				required: false
			},
			{
				name: "stop",
				type: Discord.Constants.ApplicationCommandOptionTypes.BOOLEAN,
				description: "If the queue should stop. True to reveal you initiated the stop",
				required: false
			},
			{
				name: "skip",
				type: Discord.Constants.ApplicationCommandOptionTypes.INTEGER,
				description: "Skip a number of songs in the queue",
				min_value: 1,
				required: false
			},
			{
				name: "volume",
				type: Discord.Constants.ApplicationCommandOptionTypes.INTEGER,
				min_value: 1,
				max_value: 500,
				description: "Set the volume % of the queue",
				required: false
			},
			{
				name: "queue",
				type: Discord.Constants.ApplicationCommandOptionTypes.INTEGER,
				description: "Show the queue page",
				min_value: 1,
				required: false
			},
			{
				name: "auto",
				type: Discord.Constants.ApplicationCommandOptionTypes.BOOLEAN,
				description: "Set the state of auto mode for the queue",
				required: false
			},
			{
				name: "loop",
				type: Discord.Constants.ApplicationCommandOptionTypes.BOOLEAN,
				description: "Set the state of loop mode for the queue",
				required: false
			},
			{
				name: "now",
				type: Discord.Constants.ApplicationCommandOptionTypes.BOOLEAN,
				description: "Show the now playing message. True to only show yourself",
				required: false
			},
			{
				name: "info",
				type: Discord.Constants.ApplicationCommandOptionTypes.BOOLEAN,
				description: "Shows the info about the current playing song. True to only show yourself",
				required: false
			},
			{
				name: "pause",
				type: Discord.Constants.ApplicationCommandOptionTypes.BOOLEAN,
				description: "Sets the paused state of the queue",
				required: false
			},
			{
				name: "related",
				type: Discord.Constants.ApplicationCommandOptionTypes.BOOLEAN,
				description: "Shows the related songs to the current playing song. True to only show yourself",
				required: false
			},
			{
				name: "lyrics",
				type: Discord.Constants.ApplicationCommandOptionTypes.BOOLEAN,
				description: "Shows the lyrics of the current playing song. True to only show yourself",
				required: false
			},
			{
				name: "seek",
				type: Discord.Constants.ApplicationCommandOptionTypes.INTEGER,
				description: "Seek to the current time in the current playing song",
				min_value: 1,
				required: false
			},
			{
				name: "pitch",
				type: Discord.Constants.ApplicationCommandOptionTypes.INTEGER,
				description: "Sets the pitch of the queue in decibals",
				min_value: -7,
				max_value: 7,
				required: false
			},
			{
				name: "speed",
				type: Discord.Constants.ApplicationCommandOptionTypes.INTEGER,
				description: "Sets the speed % of the queue",
				min_value: 1,
				max_value: 500,
				required: false
			},
			{
				name: "filters",
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
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
			}
		],
		async process(cmd, lang) {
			if (musicDisabled) return cmd.reply("Working on fixing currently. This is a lot harder to port than people think")
			if (!cmd.guildId || !cmd.guild) return cmd.reply(lang.audio.music.prompts.guildOnly)

			const optionPlay = cmd.options.getSubcommand(false) === "play" ? cmd.options : null
			const optionStop = cmd.options.getBoolean("stop", false)
			const optionSkip = cmd.options.getInteger("skip", false)
			const optionVolume = cmd.options.getInteger("volume", false)
			const optionQueue = cmd.options.getInteger("queue", false)
			const optionAuto = cmd.options.getBoolean("auto", false)
			const optionLoop = cmd.options.getBoolean("loop", false)
			const optionNow = cmd.options.getBoolean("now", false)
			const optionInfo = cmd.options.getBoolean("info", false)
			const optionPause = cmd.options.getBoolean("pause", false)
			const optionRelated = cmd.options.getBoolean("related", false)
			const optionLyrics = cmd.options.getBoolean("lyrics", false)
			const optionSeek = cmd.options.getInteger("seek", false)
			const optionPitch = cmd.options.getInteger("pitch", false)
			const optionSpeed = cmd.options.getInteger("speed", false)
			const optionFilters = cmd.options.getString("filters", false)

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
				optionFilters
			]

			const notNull = array.filter(i => i !== null)

			if (notNull.length === 0) return cmd.reply(language.replace(lang.audio.music.prompts.invalidAction, { username: cmd.user.username }))
			if (notNull.length > 1) return cmd.reply("You can only do 1 action at a time")

			let queue = queues.get(cmd.guildId)
			if (!queue && optionPlay === null) return cmd.reply(language.replace(lang.audio.music.prompts.nothingPlaying, { username: cmd.user.username }))

			await cmd.defer()
			const userVoiceState = await orm.db.get("voice_states", { guild_id: cmd.guildId, user_id: cmd.user.id })
			if (!userVoiceState) return cmd.editReply(language.replace(lang.audio.music.prompts.voiceChannelRequired, { username: cmd.user.username }))
			if (queue && queue.voiceChannelID && userVoiceState.channel_id !== queue.voiceChannelID) return cmd.editReply(language.replace(lang.audio.music.returns.queueIn, { channel: `<#${queue.voiceChannelID}>` }))

			if (optionPlay !== null) {
				const search = optionPlay.getString("content", true)
				const source = (optionPlay.getString("source", false) || "yt") as string
				const node = (queue && queue.node ? common.nodes.byID(queue.node) || common.nodes.random() : common.nodes.random())
				let queueDidntExist = false

				if (!queue) {
					queueDidntExist = true
					queue = new queueFile(cmd.guildId)
					queue.lang = cmd.guildLocale ? language.getLang(cmd.guildLocale) : lang
					queue.interaction = cmd
					await cmd.editReply({ embeds: [new Discord.MessageEmbed().setColor(constants.standard_embed_color).setDescription(language.replace(lang.audio.music.prompts.queueNowPlaying, { "song": `[**LOADING**](https://amanda.moe)\n\n\`[${text.progressBar(18, 60, 60, "[LOADING]")}]\`` }))] })
					const key = `${cmd.guildId}.${userVoiceState.channel_id}`
					try {
						await passthrough.requester.request(constants.GATEWAY_WORKER_CODES.SEND_MESSAGE, { op: 4, d: { guild_id: cmd.guildId, channel_id: userVoiceState.channel_id } }, d => passthrough.gateway.postMessage(d))
					} catch {
						return cmd.editReply(language.replace(lang.audio.music.prompts.voiceCantJoin, { username: cmd.user.username }))
					}
					const promise = new Promise<boolean>(resolve => voiceStateTriggers.set(key, resolve))
					const timer = setTimeout(() => voiceStateTriggers.get(key)?.(false), waitForClientVCJoinTimeout)
					const result = await promise
					if (!result) {
						voiceStateTriggers.delete(key)
						queue.destroy()
						return cmd.editReply(language.replace(lang.audio.music.prompts.voiceCantJoin, { username: cmd.user.username }))
					} else {
						clearTimeout(timer)
						voiceStateTriggers.delete(key)
					}
				}

				const matches = await common.loadtracks(`${source}search:${search}`, node.id)
				if (!matches || !matches[0] || (matches && matches[0] && !matches[0].track)) {
					if (queue.songs.length === 0) queue.destroy()
					return cmd.editReply(lang.audio.music.prompts.noResults)
				}

				queue.songs.push(new songTypes.YouTubeSong(matches[0].info.identifier, matches[0].info.title, Math.round(matches[0].info.length / 1000), matches[0].track, matches[0].info.author))
				if (queueDidntExist) queue.play()
				/* if (match && match.type == "youtube" && match.id) {
					if (node.search_with_invidious) { // Resolve tracks with Invidious
						common.invidious.getData(match.id, node.host).then(data => {
							// Now get the URL.
							// This can throw an error if there's no formats (i.e. video is unavailable?)
							// If it does, we'll end up in the catch block to search instead.
							const url = common.invidious.dataToURL(data)
							// The ID worked. Add the song
							const track = encoding.encode({
								flags: 1,
								version: 2,
								title: data.title,
								author: data.author,
								length: BigInt(data.lengthSeconds) * BigInt(1000),
								identifier: data.videoId,
								isStream: data.liveNow, // this is a guess
								uri: url,
								source: "http",
								position: BigInt(0)
							})
							if (track) {
								const song = new songTypes.YouTubeSong(data.videoId, data.title, data.lengthSeconds, track, data.uploader)
								common.inserters.handleSong(song, msg.channel, voiceChannel, insert, msg)
							} else throw new Error("NO_TRACK")
						}).catch(() => {
							// Otherwise, start a search
							common.inserters.fromSearch(msg.channel, voiceChannel, msg.author, insert, search, lang)
						})
					} else { // Resolve tracks with Lavalink
						common.getTracks(match.id, voiceChannel.rtcRegion).then(tracks => {
							if (tracks[0]) {
								// If the ID worked, add the song
								common.inserters.fromData(msg.channel, voiceChannel, tracks[0], insert, msg)
							} else throw new Error("No tracks available")
						}).catch(() => {
							// Otherwise, start a search
							common.inserters.fromSearch(msg.channel, voiceChannel, msg.author, insert, search, lang)
						})
					}
				} else if (match && match.type == "playlist" && match.list) { // Linked to a playlist. `list` is set, `id` may or may not be.
					// Get the tracks
					let tracks = await common.getTracks(match.list, voiceChannel.rtcRegion)
					// Figure out what index was linked to, if any
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
						const options = [
							lang.audio.playlist.prompts.playFromStart,
							lang.audio.playlist.prompts.playFromLinked,
							lang.audio.playlist.prompts.playOnlyLinked
						]
						// Make an embed
						const embed = new Discord.MessageEmbed()
							.setTitle(lang.audio.playlist.prompts.playlistSection)
							.setColor(constants.standard_embed_color)
							.setDescription(
								utils.replace(lang.audio.playlist.prompts.userLinked, { "title": `**${Discord.Util.escapeMarkdown(tracks[linkedIndex].info.title)}**` })
							+ `\n${lang.audio.playlist.prompts.query}`
							+ options.map((o, i) => `\n${i + 1}: ${o}`).join("")
							+ `\n${lang.audio.playlist.prompts.selectionInfo}`
							)
						// Create the reaction menu
						const content = await utils.contentify(msg.channel, embed)
						new InteractionMenu(msg.channel, [
							{ emoji: { id: "327896448232325130", name: "bn_1" }, style: "PRIMARY", ignore: "total", actionType: "js", actionData: (message) => { embed.setDescription(`» ${options[0]}`); message.edit(content); common.inserters.fromDataArray(message.channel, voiceChannel, tracks, insert) } },
							{ emoji: { id: "327896448505217037", name: "bn_2" }, style: "SECONDARY", ignore: "total", actionType: "js", actionData: (message) => { embed.setDescription(`» ${options[1]}`); message.edit(content); common.inserters.fromDataArray(message.channel, voiceChannel, tracks.slice(linkedIndex), insert) } },
							{ emoji: { id: "327896452363976704", name: "bn_3" }, style: "SECONDARY", ignore: "total", actionType: "js", actionData: (message) => { embed.setDescription(`» ${options[2]}`); message.edit(content); common.inserters.fromData(message.channel, voiceChannel, tracks[linkedIndex], insert) } }
						]).create(await utils.contentify(msg.channel, embed))
					}
				} else if (match && match.type === "soundcloud") {
					common.inserters.fromSoundCloudLink(msg.channel, voiceChannel, msg, insert, match.link, lang)
				} else if (match && match.type === "spotify") {
					common.inserters.fromSpotifyLink(msg.channel, voiceChannel, msg, insert, match.link, lang)
				} else if (match && match.type === "newgrounds") {
					common.inserters.fromNewgroundsLink(msg.channel, voiceChannel, msg, insert, match.link, lang)
				} else if (match && match.type === "twitter") {
					common.inserters.fromTwitterLink(msg.channel, voiceChannel, msg, insert, match.link, lang)
				} else if (match && match.type === "itunes") {
					common.inserters.fromiTunesLink(msg.channel, voiceChannel, msg, insert, match.link, lang)
				} else if (match && match.type === "external") {
					common.inserters.fromExternalLink(msg.channel, voiceChannel, msg, insert, match.link, lang)
				} else {
					// User input wasn't a playlist and wasn't a video. Start a search.
					common.inserters.fromSearch(msg.channel, voiceChannel, msg.author, insert, search, lang)
				}*/
			}

			if (!queue) return cmd.reply(language.replace(lang.audio.music.prompts.nothingPlaying, { username: cmd.user.username }))

			if (optionStop !== null) {
				queue.destroy()
				return cmd.reply({ content: `queue stopped by ${cmd.user.tag}`, ephemeral: !optionStop })
			}
		}
	}
])
