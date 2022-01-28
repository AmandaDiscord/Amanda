import Discord from "thunderstorm"

import passthrough from "../../passthrough"
const { client, commands, constants, sync, queues } = passthrough

const common = sync.require("./utils") as typeof import("./utils")
const queueFile = sync.require("./queue") as typeof import("./queue")
const songTypes = sync.require("./songtypes") as typeof import("./songtypes")

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
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
				description: "Play music. You can do specific site searching like: yt:despacito, sc:despacito or ng:despacito.",
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
			},
			{
				name: "frisky",
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
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
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
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
			}
		],
		async process(cmd, lang) {
			if (musicDisabled) return cmd.reply("Working on fixing currently. This is a lot harder than people think")
			if (!cmd.guildId || !cmd.guild) return cmd.reply(lang.audio.music.prompts.guildOnly)

			const optionPlay = cmd.options.getString("play", false)
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
			const optionFrisky = cmd.options.getString("frisky", false)
			const optionListenmoe = cmd.options.getString("listenmoe", false)

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
				optionListenmoe
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

			async function createQueue() {
				queue = new queueFile(cmd.guildId!)
				queue.lang = cmd.guildLocale ? language.getLang(cmd.guildLocale) : lang
				queue.interaction = cmd
				cmd.editReply({ embeds: [new Discord.MessageEmbed().setColor(constants.standard_embed_color).setDescription(language.replace(lang.audio.music.prompts.queueNowPlaying, { "song": `[**LOADING**](https://amanda.moe)\n\n\`[${text.progressBar(18, 60, 60, "[LOADING]")}]\`` }))] }).catch(() => void 0)
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
					logger.error(e)
					queue!.destroy()
					queue = undefined
					cmd.editReply(`${language.replace(lang.audio.music.prompts.voiceCantJoin, { username: cmd.user.username })}\n${await text.stringify(e)}`).catch(() => void 0)
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

				const id = common.inputToID(optionPlay)
				const song = await common.idToSong(id, node.id)
				if (!song) {
					if (queue.songs.length === 0) queue.destroy()
					return cmd.editReply(lang.audio.music.prompts.noResults)
				}

				queue.songs.push(song)
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

				const song = new songTypes.FriskySong(optionFrisky as ConstructorParameters<typeof songTypes.FriskySong>["0"])
				queue.songs.push(song)
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

				const song = new songTypes.ListenMoeSong(optionListenmoe as ConstructorParameters<typeof songTypes.ListenMoeSong>["0"])
				queue.songs.push(song)
				if (queueDidntExist) queue.play()
				else queue.interaction = cmd
				return
			}

			if (!queue || !queue.songs[0]) return cmd.editReply(language.replace(lang.audio.music.prompts.nothingPlaying, { username: cmd.user.username }))

			if (optionStop !== null) {
				queue.destroy()
				return cmd.editReply({ content: `queue stopped by ${cmd.user.tag}` })
			} else if (optionAuto !== null) {
				queue.auto = optionAuto
				return cmd.editReply(lang.audio.music.prompts[queue.auto ? "autoOn" : "autoOff"])
			} else if (optionInfo !== null) {
				const info = await queue.songs[0].showInfo()
				return cmd.editReply(typeof info === "string" ? info : { embeds: [info] })
			} else if (optionLoop !== null) {
				queue.loop = optionLoop
				return cmd.editReply(lang.audio.music.prompts[queue.loop ? "loopOn" : "loopOff"])
			} else if (optionLyrics !== null) {
				const lyrics = await queue.songs[0].getLyrics()
				if (!lyrics) return cmd.editReply("Could not get song lyrics or there were no song lyrics")
				return cmd.editReply({ embeds: [new Discord.MessageEmbed().setColor(constants.standard_embed_color).setDescription(`${lyrics.slice(0, 1996)}...`)] })
			} else if (optionNow !== null) queue.interaction = cmd
			else if (optionPause !== null) {
				queue.paused = optionPause
				return cmd.editReply("Pause toggled")
			} else if (optionPitch !== null) {
				const pitch = (2 ** (optionPitch / 12))
				queue.pitch = pitch
				return cmd.editReply(`Queue pitch is now ${pitch} semitones`)
			} else if (optionQueue !== null) {
				const rows = queue.songs.map((song, index) => `${index + 1}. ${song.queueLine}`)
				const totalLength = `\n${language.replace(lang.audio.music.prompts.totalLength, { "number": time.prettySeconds(queue.totalDuration) })}`
				const body = `${text.removeMiddleRows(rows, 2000 - totalLength.length).join("\n")}${totalLength}`
				return cmd.editReply({ embeds: [new Discord.MessageEmbed().setTitle(language.replace(lang.audio.music.prompts.queueFor, { "server": Discord.Util.escapeMarkdown(cmd.guild.name) })).setDescription(body).setColor(constants.standard_embed_color)] })
			} else if (optionRelated !== null) {
				const related = await queue.songs[0].showRelated()
				return cmd.editReply(typeof related === "string" ? related : { embeds: [related] })
			} else if (optionSkip !== null) {
				const amount = optionSkip
				if (queue.songs.length < amount) return cmd.editReply(lang.audio.music.prompts.tooManySkips)
				if (queue.songs.length == amount) {
					queue.destroy()
					return cmd.editReply("Skipped all songs in queue. Queue destroyed")
				}
				queue.songs.splice(1, amount - 1)
				queue._nextSong()
				return cmd.editReply(`Skipped ${amount} songs`)
			} else if (optionSpeed !== null) {
				queue.speed = optionSpeed / 100
				return cmd.editReply(`Queue speed set to ${optionSpeed}%`)
			} else if (optionVolume !== null) {
				queue.volume = optionVolume / 100
				return cmd.editReply(`Queue volume set to ${optionVolume}%`)
			} else return cmd.editReply("Working on re-adding. Please give me time")
		}
	}
])
