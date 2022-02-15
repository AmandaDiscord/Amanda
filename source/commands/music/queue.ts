import Discord from "thunderstorm"
import mixin from "mixin-deep"
import { BetterComponent } from "callback-components"

import passthrough from "../../passthrough"
const { sync, queues, client, config, constants } = passthrough

const common = sync.require("./utils") as typeof import("./utils")

const logger = sync.require("../../utils/logger") as typeof import("../../utils/logger")
const language = sync.require("../../utils/language") as typeof import("../../utils/language")
const time = sync.require("../../utils/time") as typeof import("../../utils/time")
const discordUtils = sync.require("../../utils/discord") as typeof import("../../utils/discord")
const orm = sync.require("../../utils/orm") as typeof import("../../utils/orm")

const BetterTimeout = sync.require("../../utils/classes/BetterTimeout") as typeof import("../../utils/classes/BetterTimeout")
const FrequencyUpdater = sync.require("../../utils/classes/FrequencyUpdater") as typeof import("../../utils/classes/FrequencyUpdater")

const queueDestroyAfter = 20000
const interactionExpiresAfter = 1000 * 60 * 14
const stopDisplayingErrorsAfter = 3

class Queue {
	public guildID: string
	public voiceChannelID: string | undefined
	public songs: Array<import("./songtypes").Song> = []
	public node: string | undefined
	public lang: import("@amanda/lang").Lang
	public leavingSoonID: string | undefined
	public player: import("lavacord").Player | undefined
	public menu: Array<BetterComponent> = []

	public nightcore = false
	public antiNightcore = false
	public loop = false
	public auto = false

	public songStartTime = 0
	public pausedAt: number | null = null
	public errorChain = 0

	public listeners = new Discord.Collection<string, import("thunderstorm").User>()
	public leaveTimeout = new BetterTimeout().setCallback(() => {
		if (!this._interactionExpired && this.interaction) this.interaction.followUp(this.lang.audio.music.prompts.everyoneLeft).catch(() => void 0)
		this.destroy()
	}).setDelay(queueDestroyAfter)
	public messageUpdater: import("../../utils/classes/FrequencyUpdater") = new FrequencyUpdater(() => this._updateMessage())

	private _volume = 1
	private _interaction: import("thunderstorm").CommandInteraction | undefined
	private _interactionExpired = false
	private _interactionExpireTimeout: NodeJS.Timeout | null = null

	public constructor(guildID: string) {
		this.guildID = guildID
		queues.set(guildID, this)
	}

	public get interaction() {
		return this._interaction
	}

	public set interaction(value) {
		if (!this._interactionExpired && this._interaction) this._interaction.editReply({ embeds: [new Discord.MessageEmbed().setColor(constants.standard_embed_color).setDescription("There's a newer now playing message")] }).catch(() => void 0)
		this._interactionExpired = false
		this.menu.forEach(bn => bn.destroy())
		this.menu.length = 0
		if (value != undefined) {
			if (this._interactionExpireTimeout) clearTimeout(this._interactionExpireTimeout)
			this._interactionExpired = false
			this.createNPMenu()
			this._interactionExpireTimeout = setTimeout(() => {
				this.messageUpdater.stop()
				this._interactionExpired = true
			}, interactionExpiresAfter)
		} else {
			if (this._interactionExpireTimeout) clearTimeout(this._interactionExpireTimeout)
			this._interactionExpired = false
			this.messageUpdater.stop()
		}
		this._interaction = value
	}

	public get speed() {
		return this.player?.state.filters.timescale?.speed || 1
	}

	public set speed(amount) {
		this.player?.filters(mixin(this.player!.state.filters, { timescale: { speed: amount } }))
	}

	public get paused() {
		return this.player?.paused || false
	}

	public set paused(newState) {
		if (newState) this.pausedAt = Date.now()
		else this.pausedAt = null
		this.player?.pause(newState)
	}

	public get volume() {
		return this._volume
	}

	public set volume(amount) {
		this._volume = amount
		this.player?.volume(amount)
	}

	public get pitch() {
		return this.player?.state.filters.timescale?.pitch || 1
	}

	public set pitch(amount) {
		this.player?.filters(mixin(this.player!.state.filters, { timescale: { pitch: amount } }))
	}

	public get time() {
		if (this.paused) return this.pausedAt! - this.songStartTime
		else return Date.now() - this.songStartTime
	}

	public get timeSeconds() {
		return Math.round(this.time / 1000)
	}

	public get totalDuration() {
		return this.songs.reduce((acc, cur) => (acc + cur.lengthSeconds), 0)
	}

	public addPlayerListeners() {
		this.player!.on("end", event => this._onEnd(event))
		this.player!.on("playerUpdate", event => this._onPlayerUpdate(event))
		this.player!.on("error", event => this._onPlayerError(event))
	}

	public async play() {
		const song = this.songs[0]
		if (this.songs[1]) this.songs[1].prepare()
		await song.prepare()
		if (!song.error) {
			if (song.track == "!") song.error = this.lang.audio.music.prompts.songErrorExclaimation
			else if (song.track == null) song.error = this.lang.audio.music.prompts.songErrorNull
		}
		if (song.error) {
			logger.error(`Song error call C: { id: ${song.id}, error: ${song.error} }`)
			this._reportError()
			this._nextSong()
		} else {
			await this.player!.play(song.track)
			this.songStartTime = Date.now()
			this.pausedAt = null
			this._startNPUpdates()
		}
	}

	public destroy() {
		this.menu.forEach(bn => bn.destroy())
		for (const song of this.songs) {
			try {
				song.destroy()
			} catch (e) {
				logger.error(`Song destroy error:\n${e}`)
			}
		}
		this.songs.length = 0
		this.leaveTimeout.clear()
		this.messageUpdater.stop()
		if (!this._interactionExpired) this.interaction?.editReply({ embeds: [new Discord.MessageEmbed().setDescription("It looks like this queue has ended").setColor(constants.standard_embed_color)], components: [] }).catch(() => void 0)
		this.player?.destroy().catch(() => void 0)
		client.lavalink!.leave(this.guildID).catch(() => void 0)
		queues.delete(this.guildID)
	}

	public async _nextSong() {
		if (this.songs[1] && this.songs[1].live && (this.nightcore || this.antiNightcore || this.speed != 1)) {
			this.nightcore = false
			this.antiNightcore = false
			this.speed = 1.0
		}
		// Special case for loop 1
		if (this.songs.length === 1 && this.loop && !this.songs[0].error) {
			this.play()
			return
		}

		// Destroy current song (if loop is disabled)
		if (this.songs[0] && (!this.loop || this.songs[0].error)) this.songs[0].destroy()
		// Out of songs? (This should only pass if loop mode is also disabled.)
		if (this.songs.length <= 1) {
			// Is auto mode on?
			if (this.auto) {
				// Store the current song
				const lastPlayed = this.songs[0]
				// Get related
				const related = await lastPlayed.getRelated()
				// Can we play a related song?
				if (related.length) {
					this.songs.shift()
					this.songs.push(related[0])
				} else { // No related songs. Destroy.
					if (!this._interactionExpired) this.interaction?.followUp(this.lang.audio.music.prompts.autoRanOut)
					this.auto = false
					// this.audit.push({ action: "Queue Destroy", platform: "System", user: "Amanda" })
					this.destroy()
				}
			} else { // Auto mode is off. Dissolve.
				// this.audit.push({ action: "Queue Destroy", platform: "System", user: "Amanda" })
				this.destroy()
			}
		} else { // We have more songs. Move on.
			const removed = this.songs.shift()
			// In loop mode, add the just played song back to the end of the queue.
			if (removed && this.loop && !removed.error) {
				this.songs.push(removed)
			}
			this.play()
		}
	}

	public createNPMenu(assign = true) {
		const newMenu = [
			new BetterComponent({ emoji: { id: null, name: "⏯" }, style: "SECONDARY", type: Discord.Constants.MessageComponentTypes.BUTTON }).setCallback(interaction => {
				interaction.deferUpdate()
				if (!this.listeners.get(interaction.user.id)) return
				this.paused = !this.paused
			}),
			new BetterComponent({ emoji: { id: null, name: "⏭" }, style: "SECONDARY", type: Discord.Constants.MessageComponentTypes.BUTTON }).setCallback(interaction => {
				interaction.deferUpdate()
				if (!this.listeners.get(interaction.user.id)) return
				this.skip()
			}),
			new BetterComponent({ emoji: { id: null, name: "⏹" }, style: "DANGER", type: Discord.Constants.MessageComponentTypes.BUTTON }).setCallback(interaction => {
				interaction.deferUpdate()
				if (!this.listeners.get(interaction.user.id)) return
				this.destroy()
			})
		]
		if (assign) this.menu = newMenu
		return newMenu
	}

	public skip(amount = 1) {
		if (amount) {
			for (let i = 1; i <= amount - 1; i++) { // count from 1 to amount-1, inclusive
				this.removeSong(1)
			}
		}
		this.player?.stop().catch(() => void 0)
	}

	public removeSong(index: number) {
		// Validate index
		if (index == 0) return 1
		if (!this.songs[index]) return 1
		// Actually remove
		const removed = this.songs.splice(index, 1)[0]
		if (!removed) return 2
		try {
			removed.destroy()
		} catch (e) {
			logger.error(`Song destroy error:\n${e}`)
		}
		return 0
	}

	private _onEnd(event: import("lavacord").LavalinkEvent) {
		if (event.reason == "REPLACED") return
		if (event.type === "TrackStuckEvent") {
			// this.audit.push({ action: "Queue Skip (Song got stuck)", platform: "System", user: "Amanda" })
			if (this.songs[0]) {
				let reason = ""
				if (event.error) reason += `${event.error}\n`
				if (event.reason) reason += event.reason
				this.songs[0].error = reason.length ? reason.trim() : "Song got stuck"
				logger.error("Song error call D")
				this._reportError()
			}
		}
		this._nextSong()
	}

	private _onPlayerUpdate(data: { state: import("lavacord").LavalinkPlayerState }) {
		if (this.player && !this.paused) {
			const newSongStartTime = (data.state.time || 0) - (data.state.position || 0)
			this.songStartTime = newSongStartTime
		}
	}

	private _onPlayerError(details: import("lavacord").LavalinkEvent) {
		if (details.type === "WebSocketClosedEvent") {
			// Caused when either voice channel deleted, or someone disconnected Amanda through context menu
			// Simply respond by stopping the queue, since that was most likely the intention.
			// this.audit.push({ action: "Queue Destroy (Socket Closed. Was the channel deleted?)", platform: "System", user: "Amanda" })
			return this.destroy()
		}
		logger.error(`Lavalink error event at ${new Date().toUTCString()}\n${details}`)
		if (this.songs[0]) {
			this.songs[0].error = details.error ? details.error : "There was an exception when trying to play that track. That's all I know"
			logger.error("Song error call B")
			this._reportError()
			this._nextSong()
		} else this.destroy()
	}

	private _startNPUpdates() {
		if (!this.songs[0]) return logger.error("Tried to call Queue._startNPUpdates but no songs")
		const frequency = this.songs[0].npUpdateFrequency
		const timeUntilNext5 = frequency - ((Date.now() - this.songStartTime) % frequency)
		const triggerNow = timeUntilNext5 > 1500
		this.messageUpdater.start(frequency, triggerNow, timeUntilNext5)
	}

	private async _updateMessage() {
		if (this._interactionExpired) this.interaction = undefined
		if (!this.interaction) return
		const song = this.songs[0]
		if (song) {
			const embed = new Discord.MessageEmbed()
			const progress = song.getProgress(this.timeSeconds, this.paused)
			const link = await song.showLink().catch(() => "https://amanda.moe")
			embed.setDescription(language.replace(this.lang.audio.music.prompts.queueNowPlaying, { "song": `[**${Discord.Util.escapeMarkdown(song.title)}**](${link})\n\n${progress}` }))
			embed.setColor(constants.standard_embed_color)
			this.interaction?.editReply({ embeds: [embed], components: [new Discord.MessageActionRow().addComponents(this.menu.map(bn => bn.toComponent()))] }).catch(() => {
				this._interactionExpired = true
			})
		}
	}

	private _onAllUsersLeave() {
		this.leaveTimeout.run()
		if (!this._interactionExpired) this.interaction?.followUp(language.replace(this.lang.audio.music.prompts.noUsersLeft, { time: time.shortTime(queueDestroyAfter, "ms") })).then(msg => this.leavingSoonID = msg.id).catch(() => void 0)
	}

	private _reportError() {
		const sendReport = (contents: import("thunderstorm").MessageEmbed) => {
			// Report to original channel
			if (!this._interactionExpired) this.interaction?.followUp({ embeds: [contents] })
			// Report to #amanda-error-log
			const reportTarget = "512869106089852949"
			const embed = new Discord.MessageEmbed()
			embed.setTitle("Music error occurred.")
			embed.setDescription("The next message is the message that was sent to the user.")
			const node = this.node ? common.nodes.byID(this.node) : undefined
			const undef = "undefined"
			const details = [
				["Cluster", config.cluster_id],
				["Guild ID", this.interaction?.guild!.id || undef],
				["Text channel", this.interaction?.channel?.id || undef],
				["Voice channel", this.voiceChannelID || undef],
				["Using Invidious", String(node && node.search_with_invidious ? true : false)],
				["Invidious origin", `\`${node?.invidious_origin || "NONE"}\``],
				["Queue node", node ? node.name : "Unnamed"]
			]
			const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
			const detailsString = details.map(row =>
				`\`${row[0]}${" ​".repeat(maxLength - row?.[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
			).join("\n")
			embed.addField(
				"Details",
				detailsString
			)
			embed.setColor(0xff2ee7)
			const rchan = new Discord.PartialChannel(client, { id: reportTarget })
			rchan.send({ embeds: [embed, contents] }).catch(() => void 0)
		}
		this.errorChain++
		if (this.errorChain <= stopDisplayingErrorsAfter) {
			const song = this.songs[0]
			if (song) {
				const embed = new Discord.MessageEmbed()
					.setTitle(this.lang.audio.music.prompts.songNotPlayable)
					.setDescription(
						`**${Discord.Util.escapeMarkdown(song.title)}** (ID: ${song.id})`
					+ `\n${song.error}`
					)
					.setColor(0xdd2d2d)
				sendReport(embed)
			} else {
				const embed = new Discord.MessageEmbed()
					.setTitle(this.lang.audio.music.prompts.errorOccured)
					.setDescription(language.replace(this.lang.audio.music.prompts.songErrorNotObject, { "song": song }))
					.setColor(0xdd2d2d)
				sendReport(embed)
			}
			if (this.errorChain === 3) {
				if (!this._interactionExpired) {
					this.interaction?.followUp({ embeds: [
						new Discord.MessageEmbed()
							.setTitle(this.lang.audio.music.prompts.tooManyErrors)
							.setDescription(this.lang.audio.music.prompts.errorsSuppressed)
							.setColor(0xff2ee7)
					]
					})
				}
			}
		}
	}

	public async voiceStateUpdate(packet: import("lavacord").VoiceStateUpdate) {
		if (packet.channel_id && packet.user_id === client.user!.id) {
			this.voiceChannelID = packet.channel_id

			const states = await orm.db.select("voice_states", { channel_id: this.voiceChannelID }, { select: ["user_id"] })

			for (const state of states) {
				const user = await discordUtils.getUser(state.user_id)
				if (user && !user.bot) this.listeners.set(user.id, user)
			}
		}
		// moving voice channels does not set the channel_id as null and then update
		if (!packet.channel_id && this.voiceChannelID && packet.user_id === client.user!.id) return this.destroy()
		if (!packet.channel_id && this.listeners.has(packet.user_id)) {
			this.listeners.delete(packet.user_id)
			if (this.listeners.size === 0) return this._onAllUsersLeave()
		}
		if (packet.channel_id && packet.channel_id === this.voiceChannelID && packet.user_id !== client.user!.id) {
			const user = await discordUtils.getUser(packet.user_id)
			if (!user || (user && user.bot)) return
			this.leaveTimeout.clear()
			if (this.leavingSoonID && this.interaction) client._snow.interaction.deleteFollowupMessage(this.interaction.applicationId, this.interaction.token, this.leavingSoonID)
			this.leavingSoonID = undefined
			this.listeners.set(user.id, user)
		}
	}
}

export = Queue
