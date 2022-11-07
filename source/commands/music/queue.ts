import util from "util"

import mixin from "mixin-deep"
import { BetterComponent } from "callback-components"

import passthrough from "../../passthrough"
const { sync, queues, client, config, constants, websiteSocket } = passthrough

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
	public tracks: Array<import("./tracktypes").Track> = []
	public node: string | undefined
	public lang: import("@amanda/lang").Lang
	public leavingSoonID: string | undefined
	public player: import("lavacord").Player | undefined
	public menu: Array<BetterComponent> = []

	public nightcore = false
	public antiNightcore = false
	public loop = false
	public auto = false

	public trackStartTime = 0
	public pausedAt: number | null = null
	public errorChain = 0

	public listeners = new Map<string, import("discord-typings").User>()
	public leaveTimeout = new BetterTimeout().setCallback(() => {
		if (!this._interactionExpired && this.interaction) client.snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, { content: this.lang.GLOBAL.EVERYONE_LEFT }).catch(() => void 0)
		this.destroy()
	}).setDelay(queueDestroyAfter)
	public messageUpdater: import("../../utils/classes/FrequencyUpdater") = new FrequencyUpdater(() => this._updateMessage())

	private _volume = 1
	private _interaction: import("../../modules/Command") | undefined
	private _interactionExpired = false
	private _interactionExpireTimeout: NodeJS.Timeout | null = null

	public constructor(guildID: string) {
		this.guildID = guildID
		queues.set(guildID, this)
	}

	public toJSON(): import("../../types").WebQueue | null {
		if (!this.voiceChannelID) return null
		return {
			members: [client.user, ...this.listeners.values()].map(m => ({ id: m.id, tag: `${m.username}#${m.discriminator}`, avatar: m.avatar, isAmanda: m.id === client.user.id })),
			tracks: this.tracks.map(s => s.toObject()),
			playing: !this.paused,
			voiceChannel: {
				id: this.voiceChannelID,
				name: "Amanda-Music"
			},
			pausedAt: this.pausedAt,
			trackStartTime: this.trackStartTime,
			attributes: {
				loop: this.loop,
				auto: this.auto
			}
		}
	}

	public get interaction() {
		return this._interaction
	}

	public set interaction(value) {
		if (!this._interactionExpired && this._interaction) client.snow.interaction.editOriginalInteractionResponse(this._interaction.application_id, this._interaction.token, { embeds: [{ color: constants.standard_embed_color, description: "There's a newer now playing message" }], components: [] }).catch(() => void 0)
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
		return this.player?.state.filters.timescale?.speed ?? 1
	}

	public set speed(amount) {
		this.player?.filters(mixin(this.player!.state.filters, { timescale: { speed: amount } }))
	}

	public get paused() {
		return this.player?.paused ?? false
	}

	public set paused(newState) {
		if (newState) this.pausedAt = Date.now()
		else this.pausedAt = null
		this.player?.pause(newState)
		websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.TIME_UPDATE, d: { trackStartTime: this.trackStartTime, pausedAt: this.pausedAt, playing: !newState } } }))
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
		this.player?.filters(mixin(this.player!.state.filters, { timescale: { pitch: amount } }))
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
		this.player!.on("end", event => this._onEnd(event))
		this.player!.on("playerUpdate", event => this._onPlayerUpdate(event))
		this.player!.on("error", event => this._onPlayerError(event as import("lavalink-types").TrackExceptionEvent))
	}

	public async play() {
		const track = this.tracks[0]
		if (this.tracks[1]) this.tracks[1].prepare()
		await track.prepare()
		if (!track.error) {
			if (track.track == "!") track.error = this.lang.GLOBAL.SONG_ERROR_EXCLAIMATION
			else if (track.track == null) track.error = this.lang.GLOBAL.SONG_ERROR_NULL
		}
		if (track.error) {
			logger.error(`Track error call C: { id: ${track.id}, error: ${track.error} }`)
			this._reportError()
			this._nextTrack()
		} else {
			await this.player!.play(track.track)
			this.trackStartTime = Date.now()
			this.pausedAt = null
			this._startNPUpdates()
		}
	}

	public async destroy() {
		this.menu.forEach(bn => bn.destroy())
		for (const track of this.tracks) {
			try {
				await track.destroy()
			} catch (e) {
				logger.error(`Track destroy error:\n${util.inspect(e, true, Infinity, true)}`)
			}
		}
		this.tracks.length = 0
		this.leaveTimeout.clear()
		this.messageUpdater.stop()
		if (!this._interactionExpired && this.interaction) client.snow.interaction.editOriginalInteractionResponse(this.interaction.application_id, this.interaction.token, { embeds: [{ color: constants.standard_embed_color, description: "It looks like this queue has ended" }], components: [] }).catch(() => void 0)
		this.player?.destroy().catch(() => void 0)
		client.lavalink!.leave(this.guildID).catch(() => void 0)
		if (this.voiceChannelID) websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.STOP } }))
		queues.delete(this.guildID)
	}

	public async _nextTrack() {
		if (this.tracks[1] && this.tracks[1].live && (this.nightcore || this.antiNightcore || this.speed != 1)) {
			this.nightcore = false
			this.antiNightcore = false
			this.speed = 1.0
		}
		// Special case for loop 1
		if (this.tracks.length === 1 && this.loop && !this.tracks[0].error) {
			this.play()
			return
		}

		// Destroy current track (if loop is disabled)
		if (this.tracks[0] && (!this.loop || this.tracks[0].error)) this.tracks[0].destroy()
		// Out of tracks? (This should only pass if loop mode is also disabled.)
		if (this.tracks.length <= 1) {
			// Is auto mode on?
			if (this.auto) {
				// Store the current track
				const lastPlayed = this.tracks[0]
				// Get related
				const related = (await lastPlayed?.getRelated()) || []
				// Can we play a related track?
				if (related.length) {
					this.tracks.shift()
					await this.addTrack(related[0])
				} else { // No related tracks. Destroy.
					if (!this._interactionExpired && this.interaction) client.snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, { content: this.lang.GLOBAL.AUTO_NONE_LEFT })
					this.auto = false
					// this.audit.push({ action: "Queue Destroy", platform: "System", user: "Amanda" })
					this.destroy()
				}
			} else { // Auto mode is off. Dissolve.
				// this.audit.push({ action: "Queue Destroy", platform: "System", user: "Amanda" })
				this.destroy()
			}
		} else { // We have more tracks. Move on.
			await new Promise(res => websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.NEXT } }), res))
			const removed = this.tracks.shift()
			// In loop mode, add the just played track back to the end of the queue.
			if (removed && this.loop && !removed.error) await this.addTrack(removed)
			this.play()
		}
	}

	public createNPMenu(assign = true) {
		const newMenu = [
			new BetterComponent({ emoji: { id: null, name: "⏯" }, style: 2, type: 2 } as Omit<import("discord-typings").Button, "custom_id">).setCallback(interaction => {
				client.snow.interaction.createInteractionResponse(interaction.id, interaction.token, { type: 6 }).catch(() => void 0)
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return
				this.paused = !this.paused
			}),
			new BetterComponent({ emoji: { id: null, name: "⏭" }, style: 2, type: 2 } as Omit<import("discord-typings").Button, "custom_id">).setCallback(interaction => {
				client.snow.interaction.createInteractionResponse(interaction.id, interaction.token, { type: 6 }).catch(() => void 0)
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return
				this.skip()
			}),
			new BetterComponent({ emoji: { id: null, name: "⏹" }, style: 4, type: 2 } as Omit<import("discord-typings").Button, "custom_id">).setCallback(interaction => {
				client.snow.interaction.createInteractionResponse(interaction.id, interaction.token, { type: 6 }).catch(() => void 0)
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return
				this.destroy()
			})
		]
		if (assign) this.menu = newMenu
		return newMenu
	}

	public skip() {
		this.player?.stop().catch(() => void 0)
	}

	public async addTrack(track: import("./tracktypes").Track, position = this.tracks.length) {
		if (position === -1) this.tracks.push(track)
		else this.tracks.splice(position, 0, track)
		await new Promise(res => websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.TRACK_ADD, d: { track: track.toObject(), position } } }), res))
	}

	public async removeTrack(index: number) {
		// Validate index
		if (index == 0) return 1
		if (!this.tracks[index]) return 1
		// Actually remove
		const removed = this.tracks.splice(index, 1)[0]
		if (!removed) return 2
		try {
			removed.destroy()
		} catch (e) {
			logger.error(`Track destroy error:\n${util.inspect(e, true, Infinity, true)}`)
		}
		await new Promise(res => websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.TRACK_REMOVE, d: { index } } }), res))
		return 0
	}

	private _onEnd(event: import("lavacord").LavalinkEvent) {
		if (event.reason == "REPLACED") return
		if (event.type === "TrackStuckEvent") {
			// this.audit.push({ action: "Queue Skip (Track got stuck)", platform: "System", user: "Amanda" })
			if (this.tracks[0]) {
				let reason = ""
				if (event.error) reason += `${event.error}\n`
				if (event.reason) reason += event.reason
				this.tracks[0].error = reason.length ? reason.trim() : "Track got stuck"
				logger.error("Track error call D")
				this._reportError()
			}
		}
		this._nextTrack()
	}

	private _onPlayerUpdate(data: { state: import("lavacord").LavalinkPlayerState }) {
		if (this.player && !this.paused) {
			const newTrackStartTime = (data.state.time ?? 0) - (data.state.position ?? 0)
			this.trackStartTime = newTrackStartTime
		}
		websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.TIME_UPDATE, d: { trackStartTime: this.trackStartTime, pausedAt: this.pausedAt, playing: !this.paused } } }))
	}

	private _onPlayerError(details: import("lavalink-types").TrackExceptionEvent | import("lavalink-types").WebSocketClosedEvent) {
		if (details.type === "WebSocketClosedEvent") {
			// Caused when either voice channel deleted, or someone disconnected Amanda through context menu
			// Simply respond by stopping the queue, since that was most likely the intention.
			// this.audit.push({ action: "Queue Destroy (Socket Closed. Was the channel deleted?)", platform: "System", user: "Amanda" })
			return this.destroy()
		}
		logger.error(`Lavalink error event at ${new Date().toUTCString()}\n${util.inspect(details, true, Infinity, true)}`)
		if (this.tracks[0]) {
			this.tracks[0].error = details.exception.message
			logger.error("Track error call B")
			this._reportError()
			this._nextTrack()
		} else this.destroy()
	}

	private _startNPUpdates() {
		if (!this.tracks[0]) return logger.error("Tried to call Queue._startNPUpdates but no tracks")
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
			client.snow.interaction.editOriginalInteractionResponse(this.interaction.application_id, this.interaction.token, {
				embeds: [
					{
						color: constants.standard_embed_color,
						description: language.replace(this.lang.GLOBAL.NOW_PLAYING, { "song": `[**${track.title}**](${link})\n\n${progress}` })
					}
				],
				components: [
					{
						type: 1,
						components: this.menu.map(bn => bn.toComponent())
					}
				]
			}).catch(() => {
				this._interactionExpired = true
			})
		}
	}

	private _onAllUsersLeave() {
		this.leaveTimeout.run()
		if (!this._interactionExpired && this.interaction) client.snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, { content: language.replace(this.lang.GLOBAL.NO_USERS_IN_VC, { time: time.shortTime(queueDestroyAfter, "ms") }) }).then(msg => this.leavingSoonID = msg.id).catch(() => void 0)
	}

	private _reportError() {
		const sendReport = (contents: import("discord-typings").Embed) => {
			// Report to original channel
			if (!this._interactionExpired && this.interaction) client.snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, { embeds: [contents] })
			// Report to #amanda-error-log
			const reportTarget = "512869106089852949"
			const node = this.node ? common.nodes.byID(this.node) : undefined
			const undef = "undefined"
			const details = [
				["Cluster", config.cluster_id],
				["Guild ID", this.interaction?.guild_id || undef],
				["Text channel", this.interaction?.channel_id || undef],
				["Voice channel", this.voiceChannelID || undef],
				["Using Invidious", String(node && node.search_with_invidious ? true : false)],
				["Invidious origin", `\`${node?.invidious_origin || "NONE"}\``],
				["Queue node", this.node || "UNNAMED"]
			]
			const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
			const detailsString = details.map(row =>
				`\`${row[0]}${" ​".repeat(maxLength - row?.[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
			).join("\n")
			client.snow.channel.createMessage(reportTarget, {
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
			const track = this.tracks[0]
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
					client.snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, {
						embeds: [
							{
								title: this.lang.GLOBAL.TOO_MANY_ERRORS,
								description: this.lang.GLOBAL.ERRORS_SUPPRESSED,
								color: 0xff2ee7
							}
						]
					})
				}
			}
		}
	}

	public async voiceStateUpdate(packet: import("lavacord").VoiceStateUpdate) {
		if (packet.channel_id && packet.user_id === client.user.id) {
			this.voiceChannelID = packet.channel_id

			const states = await orm.db.select("voice_states", { channel_id: this.voiceChannelID }, { select: ["user_id"] })

			for (const state of states) {
				const user = await discordUtils.getUser(state.user_id)
				if (user && !user.bot) this.listeners.set(user.id, user)
			}
			websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.CREATE, d: this.toJSON() }))
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
			if (this.leavingSoonID && this.interaction) client.snow.interaction.deleteFollowupMessage(this.interaction.application_id, this.interaction.token, this.leavingSoonID)
			this.leavingSoonID = undefined
			this.listeners.set(user.id, user)
		}
		if (this.voiceChannelID) websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: this.voiceChannelID, op: constants.WebsiteOPCodes.LISTENERS_UPDATE, d: { members: this.toJSON()!.members } } }))
	}
}

sync.addTemporaryListener(websiteSocket, "message", async (data: import("ws").RawData) => {
	const message = Array.isArray(data) ? Buffer.concat(data).toString() : data.toString()
	let packet: { op: number; d?: { [property: string]: unknown } }
	try {
		packet = JSON.parse(message)
	} catch (e) {
		return logger.error(`Error parsing message from website\n${util.inspect(e, true, Infinity, true)}`)
	}

	const qs = [...queues.values()]
	const queue = qs.find(q => q.voiceChannelID === packet.d?.channel_id)


	if (packet.op === constants.WebsiteOPCodes.ACKNOWLEDGE) {
		for (const q of qs) {
			websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.CREATE, d: q.toJSON() }))
		}


	} else if (packet.op === constants.WebsiteOPCodes.CLEAR_QUEUE) {
		if (queue) {
			queue.tracks.splice(1)
			websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue.voiceChannelID, op: constants.WebsiteOPCodes.CLEAR_QUEUE } }))
		}


	} else if (packet.op === constants.WebsiteOPCodes.ATTRIBUTES_CHANGE) {
		if (queue && packet.d) {
			if (packet.d.auto !== undefined) queue.auto = packet.d.auto as boolean
			if (packet.d.loop !== undefined) queue.loop = packet.d.loop as boolean
			websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue.voiceChannelID, op: constants.WebsiteOPCodes.ATTRIBUTES_CHANGE, d: { loop: queue.loop, auto: queue.auto } } }))
		}


	} else if (packet.op === constants.WebsiteOPCodes.SKIP && queue) queue.skip()
	else if (packet.op === constants.WebsiteOPCodes.STOP && queue) queue.destroy()
	else if (packet.op === constants.WebsiteOPCodes.TOGGLE_PLAYBACK && queue) queue.paused = !queue.paused
	else if (packet.op === constants.WebsiteOPCodes.TRACK_REMOVE && queue && packet.d && packet.d.index) {
		const result = await queue.removeTrack(packet.d.index as number)
		if (result === 0) websiteSocket.send(JSON.stringify({ op: constants.WebsiteOPCodes.ACCEPT, d: { channel_id: queue.voiceChannelID, op: constants.WebsiteOPCodes.TRACK_REMOVE, d: { index: packet.d.index } } }))
	}
})

export = Queue
