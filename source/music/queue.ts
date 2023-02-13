import util from "util"

import cc from "callback-components"

import passthrough from "../passthrough"
const { sync, queues, config, constants, snow, configuredUserID, lavalink, amqpChannel } = passthrough

const common = sync.require("./utils") as typeof import("./utils")

const discordUtils = sync.require("../client/utils/discord") as typeof import("../client/utils/discord")
const language = sync.require("../client/utils/language") as typeof import("../client/utils/language")
const time = sync.require("../client/utils/time") as typeof import("../client/utils/time")
const orm = sync.require("../client/utils/orm") as typeof import("../client/utils/orm")

const BetterTimeout = sync.require("./classes/BetterTimeout") as typeof import("./classes/BetterTimeout")
const FrequencyUpdater = sync.require("./classes/FrequencyUpdater") as typeof import("./classes/FrequencyUpdater")

const queueDestroyAfter = 20000
const interactionExpiresAfter = 1000 * 60 * 14
const stopDisplayingErrorsAfter = 3

class Queue {
	public guildID: string
	public voiceChannelID: string
	public tracks: Array<import("./tracktypes").Track> = []
	public node: string | undefined
	public lang: import("@amanda/lang").Lang
	public leavingSoonID: string | undefined
	public player: import("lavacord").Player | undefined
	public menu: Array<cc.BetterComponent> = []
	public playHasBeenCalled = false
	public listeners = new Map<string, import("discord-api-types/v10").APIUser>()

	public loop = false

	public trackStartTime = 0
	public pausedAt: number | null = null
	public errorChain = 0

	public leaveTimeout = new BetterTimeout.BetterTimeout().setCallback(() => {
		if (!this._interactionExpired && this.interaction) snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, { content: this.lang.GLOBAL.EVERYONE_LEFT }).catch(() => void 0)
		this.destroy()
	}).setDelay(queueDestroyAfter)
	public messageUpdater: import("./classes/FrequencyUpdater").FrequencyUpdater = new FrequencyUpdater.FrequencyUpdater(() => this._updateMessage())

	private _volume = 1
	private _interaction: import("../Command") | undefined
	private _interactionExpired = false
	private _interactionExpireTimeout: NodeJS.Timeout | null = null
	private _destroyed = false

	public constructor(guildID: string, channelID: string) {
		this.guildID = guildID
		this.voiceChannelID = channelID
		queues.set(guildID, this)
	}

	public toJSON(): import("../types").WebQueue {
		return {
			members: ([...this.listeners.values()]).map(m => ({ id: m.id, tag: `${m.username}#${m.discriminator}`, avatar: m.avatar, isAmanda: m.id === configuredUserID })),
			tracks: this.tracks.map(s => s.toObject()),
			playing: !this.paused,
			voiceChannel: {
				id: this.voiceChannelID,
				name: "Amanda-Music"
			},
			pausedAt: this.pausedAt,
			trackStartTime: this.trackStartTime,
			attributes: {
				loop: this.loop
			}
		}
	}

	public get interaction() {
		return this._interaction
	}

	public set interaction(value) {
		if (!this._interactionExpired && this._interaction) snow.interaction.editOriginalInteractionResponse(this._interaction.application_id, this._interaction.token, { embeds: [{ color: constants.standard_embed_color, description: "There's a newer now playing message" }], components: [] }).catch(() => void 0)
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
		if (this._interaction) this._updateMessage().catch(() => void 0)
	}

	public get speed() {
		return this.player?.state.filters.timescale?.speed ?? 1
	}

	public set speed(amount) {
		console.log(`[QUEUE_FILTERS] guild: ${this.guildID} speed set: ${amount}`)
		this.player?.filters(Object.assign(this.player!.state.filters, { timescale: { speed: amount, pitch: this.pitch } }))
	}

	public get paused() {
		return this.player?.paused ?? false
	}

	public set paused(newState) {
		if (newState) this.pausedAt = Date.now()
		else this.pausedAt = null
		console.log(`[QUEUE_PAUSE  ] guild: ${this.guildID}`)
		this.player?.pause(newState)
		amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.TIME_UPDATE, d: { trackStartTime: this.trackStartTime, pausedAt: this.pausedAt, playing: !newState } } })))
	}

	public get volume() {
		return this._volume
	}

	public set volume(amount) {
		this._volume = amount
		this.player?.volume(amount)
	}

	public get pitch() {
		return this.player?.state.filters.timescale?.pitch ?? 1
	}

	public set pitch(amount) {
		console.log(`[QUEUE_FILTERS] guild: ${this.guildID} pitch set: ${amount}`)
		this.player?.filters(Object.assign(this.player!.state.filters, { timescale: { speed: this.speed, pitch: amount } }))
	}

	public get time() {
		if (this.paused) return this.pausedAt! - this.trackStartTime
		else return Date.now() - this.trackStartTime
	}

	public get timeSeconds() {
		return Math.round(this.time / 1000)
	}

	public get totalDuration() {
		return this.tracks.reduce((acc, cur) => (acc + cur.lengthSeconds), 0)
	}

	public addPlayerListeners() {
		console.log(`[QUEUE_START  ] guild: ${this.guildID} channel: ${this.voiceChannelID}`)
		this.player!.on("end", event => this._onEnd(event))
		this.player!.on("playerUpdate", event => this._onPlayerUpdate(event))
		this.player!.on("error", event => this._onPlayerError(event))
	}

	public async play() {
		this.playHasBeenCalled = true
		const track = this.tracks[0]
		if (this.tracks[1]) this.tracks[1].prepare()
		await track.prepare()
		if (!track.error) {
			if (track.track == "!") track.error = this.lang.GLOBAL.SONG_ERROR_EXCLAIMATION
			else if (track.track == null) track.error = this.lang.GLOBAL.SONG_ERROR_NULL
		}
		if (track.error) {
			console.error(`Track error call C: { id: ${track.id}, error: ${track.error} }`)
			this._reportError()
			this._nextTrack()
		} else {
			await this.player!.play(track.track)
			this.trackStartTime = Date.now()
			this.pausedAt = null
			this._startNPUpdates()
		}
	}

	public async destroy(editInteraction = true) {
		if (this._destroyed) return
		queues.delete(this.guildID)
		this._destroyed = true
		this.menu.forEach(bn => bn.destroy())
		for (const track of this.tracks) {
			try {
				await track.destroy()
			} catch (e) {
				console.error(`Track destroy error:\n${util.inspect(e, true, Infinity, true)}`)
			}
		}
		this.tracks.length = 0
		this.leaveTimeout.clear()
		this.messageUpdater.stop()
		if (!this._interactionExpired && this.interaction && editInteraction) await snow.interaction.editOriginalInteractionResponse(this.interaction.application_id, this.interaction.token, { embeds: [{ color: constants.standard_embed_color, description: this.lang.GLOBAL.QUEUE_ENDED }], components: [] }).catch(() => void 0)
		await this.player?.destroy().catch(() => void 0)
		await lavalink!.leave(this.guildID).catch(() => void 0)
		if (this.voiceChannelID) amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.STOP } })))
		console.log(`[QUEUE_DESTROY] guild: ${this.guildID} channel: ${this.voiceChannelID}`)
	}

	public _nextTrack() {
		if (this.tracks[1] && this.tracks[1].live && this.speed != 1) this.speed = 1.0
		// Special case for loop 1
		if (this.tracks.length === 1 && this.loop && !this.tracks[0].error) {
			this.play()
			return
		}

		// Destroy current track (if loop is disabled)
		if (this.tracks[0] && (!this.loop || this.tracks[0].error)) this.tracks[0].destroy()
		// Out of tracks? (This should only pass if loop mode is also disabled.)
		if (this.tracks.length <= 1) {
			// this.audit.push({ action: "Queue Destroy", platform: "System", user: "Amanda" })
			this.destroy()
		} else { // We have more tracks. Move on.
			amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.NEXT } })))
			const removed = this.tracks.shift()
			// In loop mode, add the just played track back to the end of the queue.
			if (removed && this.loop && !removed.error) this.addTrack(removed)
			this.play()
		}
	}

	public createNPMenu(assign = true) {
		const newMenu: Queue["menu"] = [
			new cc.BetterComponent(
				{ emoji: { name: "⏯" }, style: 2, type: 2 } as Omit<import("discord-api-types/v10").APIButtonComponentWithCustomId, "custom_id">,
				{ h: "playPause" }
			).setCallback(interaction => {
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return
				this.paused = !this.paused
			}),
			new cc.BetterComponent(
				{ emoji: { name: "⏭" }, style: 2, type: 2 } as Omit<import("discord-api-types/v10").APIButtonComponentWithCustomId, "custom_id">,
				{ h: "skip" }
			).setCallback(interaction => {
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return
				this.skip()
			}),
			new cc.BetterComponent(
				{ emoji: { name: "⏹" }, style: 4, type: 2 } as Omit<import("discord-api-types/v10").APIButtonComponentWithCustomId, "custom_id">,
				{ h: "stop" }
			).setCallback(interaction => {
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return
				this.destroy()
			})
		]
		if (assign) this.menu = newMenu
		return newMenu
	}

	public skip() {
		console.log(`[QUEUE_SKIP   ] guild: ${this.guildID}`)
		this.player?.stop().catch(() => void 0)
	}

	public addTrack(track: import("./tracktypes").Track, position = this.tracks.length) {
		if (position === -1) this.tracks.push(track)
		else this.tracks.splice(position, 0, track)
		console.log(`[TRACK_ADD    ] guild: ${this.guildID} title: ${track.title} author: ${track.author} requester: ${track.requester.username}#${track.requester.discriminator} ${track.requester.id}`)
		amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.TRACK_ADD, d: { track: track.toObject(), position } } })))
	}

	public async removeTrack(index: number) {
		// Validate index
		if (index === 0) return 1
		if (!this.tracks[index]) return 1
		// Actually remove
		const removed = this.tracks.splice(index, 1)[0]
		if (!removed) return 2
		try {
			await removed.destroy()
		} catch (e) {
			console.error(`Track destroy error:\n${util.inspect(e, true, Infinity, true)}`)
		}
		amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.TRACK_REMOVE, d: { index } } })))
		console.log(`[TRACK_REMOVE ] guild: ${this.guildID} title: ${removed.title} author: ${removed.author}`)
		return 0
	}

	public async seek(position: number) {
		const track = this.tracks[0]
		if (!track) return 1
		if (track.live) return 2
		if (position > (track.lengthSeconds * 1000)) return 3
		const result = await this.player?.seek(position)
		console.log(`[QUEUE_SEEK   ] guild: ${this.guildID} pos: ${position}`)
		if (result) return 0
		else return 4
	}

	private _onEnd(event: import("lavalink-types").TrackEndEvent | import("lavalink-types").TrackStuckEvent) {
		if (event.type === "TrackEndEvent" && event.reason == "REPLACED") return
		if (event.type === "TrackStuckEvent") {
			// this.audit.push({ action: "Queue Skip (Track got stuck)", platform: "System", user: "Amanda" })
			if (this.tracks[0]) {
				this.tracks[0].error = this.lang.GLOBAL.SONG_STUCK
				console.error("Track error call D")
				this._reportError()
			}
		}
		this._nextTrack()
	}

	private _onPlayerUpdate(data: { state: import("lavalink-types").PlayerState }) {
		if (this.player && !this.paused) {
			const newTrackStartTime = (Number(data.state.time) ?? 0) - (data.state.position ?? 0)
			this.trackStartTime = newTrackStartTime
		}
		amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.TIME_UPDATE, d: { trackStartTime: this.trackStartTime, pausedAt: this.pausedAt, playing: !this.paused } } })))
	}

	private _onPlayerError(details: import("lavalink-types").TrackExceptionEvent | import("lavalink-types").WebSocketClosedEvent) {
		if (details.type === "WebSocketClosedEvent") {
			// Caused when either voice channel deleted, or someone disconnected Amanda through context menu
			// Simply respond by stopping the queue, since that was most likely the intention.
			// this.audit.push({ action: "Queue Destroy (Socket Closed. Was the channel deleted?)", platform: "System", user: "Amanda" })
			return this.destroy()
		}
		console.error(`Lavalink error event at ${new Date().toUTCString()}\n${util.inspect(details, true, Infinity, true)}`)
		if (this.tracks[0]) {
			this.tracks[0].error = details.exception.message
			console.error("Track error call B")
			this._reportError()
			this._nextTrack()
		} else this.destroy()
	}

	private _startNPUpdates() {
		if (!this.tracks[0]) return console.error("Tried to call Queue._startNPUpdates but no tracks")
		const frequency = this.tracks[0].npUpdateFrequency
		const timeUntilNext5 = frequency - ((Date.now() - this.trackStartTime) % frequency)
		const triggerNow = timeUntilNext5 > 1500
		this.messageUpdater.start(frequency, triggerNow, timeUntilNext5)
	}

	private async _updateMessage() {
		if (this._interactionExpired) this.interaction = undefined
		if (!this.interaction) return
		const track = this.tracks[0]
		if (track) {
			const progress = track.getProgress(this.timeSeconds, this.paused)
			const link = await track.showLink().catch(() => "https://amanda.moe")
			snow.interaction.editOriginalInteractionResponse(this.interaction.application_id, this.interaction.token, {
				embeds: [
					{
						color: constants.standard_embed_color,
						description: language.replace(this.lang.GLOBAL.NOW_PLAYING, { "song": `[**${track.title}**](${link})\n\n${progress}` })
					}
				],
				components: [
					{
						type: 1,
						components: this.menu.map(c => c.component)
					}
				]
			}).catch(() => {
				this._interactionExpired = true
			})
		}
	}

	private _onAllUsersLeave() {
		this.leaveTimeout.run()
		if (!this._interactionExpired && this.interaction) snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, { content: language.replace(this.lang.GLOBAL.NO_USERS_IN_VC, { time: time.shortTime(queueDestroyAfter, "ms") }) }).then(msg => this.leavingSoonID = msg.id).catch(() => void 0)
	}

	private _reportError() {
		const track = this.tracks[0]
		const sendReport = (contents: import("discord-api-types/v10").APIEmbed) => {
			contents.url = constants.server
			contents.footer = { text: this.lang.GLOBAL.TITLE_JOIN_SERVER }
			// Report to original channel
			if (!this._interactionExpired && this.interaction) snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, { embeds: [contents] })
			// Report to #amanda-error-log
			const reportTarget = "512869106089852949"
			const node = this.node ? common.nodes.byID(this.node) : undefined
			const undef = "undefined"
			const details = [
				["Tree", config.cluster_id],
				["Guild ID", this.interaction?.guild_id || undef],
				["Text channel", this.interaction?.channel_id || undef],
				["Voice channel", this.voiceChannelID || undef],
				["Using Invidious", String(node && node.search_with_invidious ? true : false)],
				["Invidious origin", `\`${node?.invidious_origin || "NONE"}\``],
				["Queue node", this.node || "UNNAMED"]
			]
			if (track) {
				details.push(...[
					["Track", track.id],
					["Input", track.input],
					["Requester id", track.requester.id],
					["Requester tag", `${track.requester.username}#${track.requester.discriminator}`]
				])
			}
			const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
			const detailsString = details.map(row =>
				`\`${row[0]}${" ​".repeat(maxLength - row?.[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
			).join("\n")
			snow.channel.createMessage(reportTarget, {
				embeds: [
					{
						color: 0xff2ee7,
						title: "Music error occurred.",
						description: "The next message is the message that was sent to the user.",
						fields: [{ name: "Details", value: detailsString }]
					},
					contents
				]
			}).catch(() => void 0)
		}
		this.errorChain++
		if (this.errorChain <= stopDisplayingErrorsAfter) {
			if (track) {
				sendReport({
					title: this.lang.GLOBAL.SONG_NOT_PLAYABLE,
					description: `**${track.title}** (ID: ${track.id})\n${track.error}`,
					color: 0xdd2d2d
				})
			} else {
				sendReport({
					title: this.lang.GLOBAL.ERROR_OCCURRED,
					description: language.replace(this.lang.GLOBAL.SONG_NOT_OBJECT, { "song": track }),
					color: 0xdd2d2d
				})
			}
			if (this.errorChain === 3) {
				if (!this._interactionExpired && this.interaction) {
					snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, {
						embeds: [
							{
								title: this.lang.GLOBAL.TOO_MANY_ERRORS,
								url: constants.server,
								description: this.lang.GLOBAL.ERRORS_SUPPRESSED,
								color: 0xff2ee7,
								footer: { text: this.lang.GLOBAL.TITLE_JOIN_SERVER }
							}
						]
					})
				}
			}
		}
	}

	public async voiceStateUpdate(packet: import("discord-api-types/v10").GatewayVoiceState) {
		if (packet.channel_id && packet.user_id === configuredUserID) {
			const states = await orm.db.select("voice_states", { channel_id: this.voiceChannelID }, { select: ["user_id"] })

			for (const state of states) {
				const user = await discordUtils.getUser(state.user_id)
				if (user && (!user.bot || user.id === configuredUserID)) this.listeners.set(user.id, user)
			}
			amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.CREATE, d: this.toJSON() })))
		}
		// moving voice channels does not set the channel_id as null and then update
		if (!packet.channel_id && this.voiceChannelID && packet.user_id === configuredUserID) return this.destroy()
		if (!packet.channel_id && this.listeners.has(packet.user_id)) {
			this.listeners.delete(packet.user_id)
			if (this.listeners.size === 0) return this._onAllUsersLeave()
		}
		if (packet.channel_id && packet.channel_id === this.voiceChannelID && packet.user_id !== configuredUserID) {
			const user = await discordUtils.getUser(packet.user_id)
			if (!user || (user && user.bot)) return
			this.leaveTimeout.clear()
			if (this.leavingSoonID && this.interaction) snow.interaction.deleteFollowupMessage(this.interaction.application_id, this.interaction.token, this.leavingSoonID).catch(() => void 0)
			this.leavingSoonID = undefined
			this.listeners.set(user.id, user)
		}
		amqpChannel.sendToQueue(config.amqp_website_queue, Buffer.from(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.LISTENERS_UPDATE, d: { members: this.toJSON()!.members } } })))
	}
}

export { Queue }
