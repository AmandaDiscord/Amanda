import util = require("util")
import { createHash } from "crypto"

import { BetterComponent } from "@amanda/buttons"
import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")
import sql = require("@amanda/sql")
import redis = require("@amanda/redis")

import type { ChatInputCommand } from "@amanda/commands"
import type { Lang } from "@amanda/lang"
import type { APIUser, APIButtonComponentWithCustomId, APIEmbed, GatewayVoiceState } from "discord-api-types/v10"
import type { TrackEndEvent, EventOP, TrackStuckEvent, PlayerState, Player as LLPlayer } from "lavalink-types/v4"
import type { Track } from "./tracktypes"
import type { Player } from "lavacord"

import type { Session } from "../ws/public"

import passthrough = require("../passthrough")
const { sync, queues, confprovider, snow, lavalink, sessions, sessionGuildIndex } = passthrough

const common = sync.require("./utils") as typeof import("./utils")

const queueDestroyAfter = 20000
const interactionExpiresAfter = 1000 * 60 * 14
const stopDisplayingErrorsAfter = 3

export class Queue {
	public tracks: Array<Track> = []
	public node: string | undefined
	public lang: Lang
	public leavingSoonID: string | undefined
	public player: Player | undefined
	public menu: Array<InstanceType<typeof BetterComponent>> = []
	public playHasBeenCalled = false
	public listeners = new Map<string, APIUser>()

	public loop = false

	public trackStartTime = 0
	public pausedAt: number | null = null
	public errorChain = 0

	public leaveTimeout = new sharedUtils.BetterTimeout().setCallback(() => {
		if (!this._interactionExpired && this.interaction) {
			snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, {
				content: this.lang.GLOBAL.EVERYONE_LEFT
			})
		}
		this.destroy()
	}).setDelay(queueDestroyAfter)

	public createResolveCallback: (() => unknown) | undefined

	public messageUpdater: sharedUtils.FrequencyUpdater = new sharedUtils.FrequencyUpdater(() => this._updateMessage())

	private _volume = 0.5
	private _interaction: ChatInputCommand | undefined
	private _interactionExpired = false
	private _interactionExpireTimeout: NodeJS.Timeout | null = null
	private _destroyed = false
	private _lastFMSent = false

	public constructor(public guildID: string, public voiceChannelID: string, public textChannelID: string) {
		queues.set(guildID, this)
	}

	public toJSON() {
		return {
			members: (Array.from(this.listeners.values())).map(m => ({
				id: m.id,
				tag: sharedUtils.userString(m),
				avatar: m.avatar,
				isAmanda: m.id === confprovider.config.client_id
			})),
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

	public get interaction(): ChatInputCommand | undefined {
		return this._interaction
	}

	public set interaction(value) {
		if (value && value.channel.id !== this.textChannelID) return
		if (!this._interactionExpired && this._interaction) {
			snow.interaction.editOriginalInteractionResponse(this._interaction.application_id, this._interaction.token, {
				embeds: [{
					color: confprovider.config.standard_embed_color,
					description: this.lang.GLOBAL.NEWER_NOW_PLAYING
				}],
				components: []
			})
		}

		this._interactionExpired = false
		this.menu.forEach(bn => bn.destroy())
		this.menu.length = 0

		if (value !== void 0) {
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
		if (this._interaction) this._updateMessage()
	}

	public get speed(): number {
		return this.player?.state.filters.timescale?.speed ?? 1
	}

	public set speed(amount) {
		if (amount === this.speed) return

		if (this.player) {
			Object.assign(this.player!.state.filters, {
				timescale: { speed: amount, pitch: this.pitch }
			})
		}
	}

	public get paused(): boolean {
		return this.player?.paused ?? false
	}

	public set paused(newState) {
		if (newState) this.pausedAt = Date.now()
		else this.pausedAt = null

		this.player?.pause(newState)
	}

	public get volume(): number {
		return this._volume
	}

	public set volume(amount) {
		this._volume = amount
		this.player?.volume(amount)
	}

	public get pitch(): number {
		return this.player?.state.filters.timescale?.pitch ?? 1
	}

	public set pitch(amount) {
		if (amount === this.pitch) return

		if (this.player) {
			Object.assign(this.player.state.filters, {
				timescale: { speed: this.speed, pitch: amount }
			})
		}
	}

	public get time(): number {
		if (this.paused) return this.pausedAt! - this.trackStartTime
		else return Date.now() - this.trackStartTime
	}

	public get timeSeconds(): number {
		return Math.round(this.time / 1000)
	}

	public get totalDuration(): number {
		return this.tracks.reduce((acc, cur) => (acc + cur.lengthSeconds), 0)
	}

	public applyFilters(): Promise<LLPlayer> | undefined {
		return this.player?.filters(this.player!.state.filters)
	}

	public addPlayerListeners(): void {
		this.player!.on("end", event => this._onEnd(event))
		this.player!.on("playerUpdate", event => this._onPlayerUpdate(event))
		this.player!.on("error", event => this._onPlayerError(event))
	}

	public async play(): Promise<void> {
		if (!this.tracks[0]) throw new Error("NO_TRACK")

		this.playHasBeenCalled = true

		const track = this.tracks[0]

		if (this.tracks[1]) this.tracks[1].prepare()
		await track.prepare()

		if (!track.error) {
			if (track.track === "!") track.error = this.lang.GLOBAL.SONG_ERROR_EXCLAIMATION
			else if (track.track === null) track.error = this.lang.GLOBAL.SONG_ERROR_NULL
		}

		if (track.error) {
			console.error(`Track error call C: { id: ${track.id}, error: ${track.error} }`)
			this._reportError()
			this._nextTrack()
		} else {
			await this.player!.play(track.track)
			if (track.error) return // From Error call B. Already calls _nextTrack
			this.trackStartTime = Date.now()
			this.pausedAt = null
			this._startNPUpdates()
			const percent40 = Math.floor((track.lengthSeconds * 1000) * 0.4)
			setTimeout(() => {
				if (this.tracks[0] === track) this._lastFMSetTrack()
			}, percent40 < 10000 ? percent40 : 10000)
		}
	}

	private async _lastFMSetTrack(): Promise<void> {
		if (this._lastFMSent) return

		if (this.listeners.size > 1) {
			const track = this.tracks[0]
			if (!track) return

			this._lastFMSent = true
			const usersAsPrepared = new Array(this.listeners.size).fill("?").map((_, ind) => `$${ind + 2}`)
			const sqlString = `SELECT * FROM connections WHERE type = $1 AND user_id IN (${usersAsPrepared})`
			const prepared = ["lastfm"]

			for (const user of this.listeners.values()) {
				prepared.push(user.id)
			}

			const connections = await sql.all<"connections">(sqlString, prepared)

			const pickedApart = common.genius.pickApart(track)

			for (const row of connections ?? []) {
				const params = new URLSearchParams({
					method: "track.scrobble",
					"artist[0]": pickedApart.artist,
					"track[0]": pickedApart.title,
					"timestamp[0]": String(Math.floor(Date.now() / 1000)),
					"duration[0]": String(track.lengthSeconds),
					"chosenByUser[0]": track.requester.id === row.user_id ? "1" : "0",
					api_key: confprovider.config.lastfm_key,
					sk: row.access
				})

				const orderedParams = Array.from(params.keys())
					.sort((a, b) => a.localeCompare(b))
					.map(param => `${param}${params.get(param)!}`)
					.join("")

				const orderedWithSecret = `${orderedParams}${confprovider.config.lastfm_sec}`

				const signature = createHash("md5").update(orderedWithSecret).digest("hex")

				await fetch("https://ws.audioscrobbler.com/2.0/", {
					method: "POST",
					body: `${params.toString()}&api_sig=${signature}&format=json`,
					headers: {
						"Content-Type": "application/x-www-form-urlencoded"
					}
				})
			}
		}
	}

	public async destroy(editInteraction = true): Promise<void> {
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
		this.sendToSubscribedSessions("onStop")

		if (!this._interactionExpired && this.interaction && editInteraction) {
			await snow.interaction.editOriginalInteractionResponse(this.interaction.application_id, this.interaction.token, {
				embeds: [{
					color: confprovider.config.standard_embed_color,
					description: this.lang.GLOBAL.QUEUE_ENDED
				}],
				components: []
			})
		}

		await lavalink!.leave(this.guildID)
	}

	private _nextTrack(): void {
		this._lastFMSent = false

		if (this.tracks?.[1]?.live && this.speed != 1) this.speed = 1.0

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
			this.sendToSubscribedSessions("onNext")

			const removed = this.tracks.shift()
			// In loop mode, add the just played track back to the end of the queue.
			if (removed && this.loop && !removed.error) this.addTrack(removed)
			this.play()
		}
	}

	public createNPMenu(assign = true): Queue["menu"] {
		const newMenu: Queue["menu"] = [
			new BetterComponent( // rewind
				{ emoji: { name: "⏪" }, style: 2, type: 2 } as Omit<APIButtonComponentWithCustomId, "custom_id">,
				{}
			).setCallback(interaction => {
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return

				this.seek(0)
			}),
			new BetterComponent( // play/pause
				{ emoji: { name: "⏯" }, style: 2, type: 2 } as Omit<APIButtonComponentWithCustomId, "custom_id">,
				{}
			).setCallback(interaction => {
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return

				this.paused = !this.paused
			}),
			new BetterComponent( // skip
				{ emoji: { name: "⏭" }, style: 2, type: 2 } as Omit<APIButtonComponentWithCustomId, "custom_id">,
				{}
			).setCallback(interaction => {
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return

				this.skip()
			}),
			new BetterComponent( // stop
				{ emoji: { name: "⏹" }, style: 4, type: 2 } as Omit<APIButtonComponentWithCustomId, "custom_id">,
				{}
			).setCallback(interaction => {
				const user = interaction.user ? interaction.user : interaction.member!.user
				if (!this.listeners.get(user.id)) return

				this.destroy()
			})
		]

		if (assign) this.menu = newMenu
		return newMenu
	}

	public skip(): void {
		this.player?.stop()
	}

	public async addTrack(track: Track, position = this.tracks.length): Promise<void> {
		if (position === -1) this.tracks.push(track)
		else this.tracks.splice(position, 0, track)

		if (!this.playHasBeenCalled) {
			await this.play()
			// already at 0.5, but it needs to trigger the update
			this.volume = 0.5
			this.sendToSubscribedSessions("sendState")
		} else this.sendToSubscribedSessions("onTrackAdd", track, position)
	}

	public async removeTrack(index: number): Promise<0 | 1 | 2> {
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

		this.sendToSubscribedSessions("onTrackRemove", index)
		return 0
	}

	public async seek(position: number): Promise<0 | 1 | 2 | 3 | 4> {
		const track = this.tracks[0]
		if (!track) return 1
		if (track.live) return 2
		if (position > (track.lengthSeconds * 1000)) return 3

		const result = await this.player?.seek(position)

		if (result) return 0
		else return 4
	}

	private _onEnd(event: TrackEndEvent | TrackStuckEvent): void {
		if (event.type === "TrackEndEvent" && event.reason === "replaced") return

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

	private _onPlayerUpdate(data: { state: PlayerState }): void {
		if (this.player && !this.paused) {
			const newTrackStartTime = (Number(data.state.time ?? 0)) - (data.state.position ?? 0)
			this.trackStartTime = newTrackStartTime
		}

		this.sendToSubscribedSessions("onTimeUpdate", { trackStartTime: this.trackStartTime, pausedAt: this.pausedAt ?? 0, playing: !this.paused })
	}

	private _onPlayerError(details: Extract<EventOP, { type: "TrackExceptionEvent" | "WebSocketClosedEvent" }>): void {
		if (details.type === "WebSocketClosedEvent") {
			// Caused when either voice channel deleted, or someone disconnected Amanda through context menu
			// Simply respond by stopping the queue, since that was most likely the intention.
			// this.audit.push({ action: "Queue Destroy (Socket Closed. Was the channel deleted?)", platform: "System", user: "Amanda" })
			return void this.destroy()
		}

		console.error(`Lavalink error event at ${new Date().toUTCString()}\n${util.inspect(details, true, Infinity, true)}`)

		if (this.tracks[0]) {
			this.tracks[0].error = details.exception.message ?? "Unknown error"
			console.error("Track error call B")
			this._reportError()
			this._nextTrack()
		} else this.destroy()
	}

	private _startNPUpdates(): void {
		if (!this.tracks[0]) return console.error("Tried to call Queue._startNPUpdates but no tracks")

		const frequency = this.tracks[0].npUpdateFrequency
		const timeUntilNext5 = frequency - ((Date.now() - this.trackStartTime) % frequency)
		const triggerNow = timeUntilNext5 > 1500

		this.messageUpdater.start(frequency, triggerNow, timeUntilNext5)
	}

	private async _updateMessage(): Promise<void> {
		if (this._interactionExpired) this.interaction = void 0
		if (!this.interaction) return

		const track = this.tracks[0]

		if (track) {
			const progress = track.getProgress(this.timeSeconds, this.paused)
			const link = await track.showLink().catch(() => "https://amanda.moe")

			snow.interaction.editOriginalInteractionResponse(this.interaction.application_id, this.interaction.token, {
				embeds: [
					{
						color: confprovider.config.standard_embed_color,
						description: langReplace(this.lang.GLOBAL.NOW_PLAYING, { "song": `[**${track.title}**](${link})\n\n${progress}` })
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

	private _onAllUsersLeave(): void {
		this.leaveTimeout.run()

		if (!this._interactionExpired && this.interaction) {
			snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, {
				content: langReplace(this.lang.GLOBAL.NO_USERS_IN_VC, { time: sharedUtils.shortTime(queueDestroyAfter, "ms") })
			}).then(msg => this.leavingSoonID = msg.id)
		}
	}

	private _reportError(): void {
		const serverURL = `${confprovider.config.website_protocol}://${confprovider.config.website_domain}/to/server`
		const track = this.tracks[0]

		const sendReport = (contents: APIEmbed) => {
			contents.url = serverURL
			contents.footer = { text: this.lang.GLOBAL.TITLE_JOIN_SERVER }
			// Report to original channel
			if (!this._interactionExpired && this.interaction) snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, { embeds: [contents] })
			// Report to #amanda-error-log
			const reportTarget = confprovider.config.error_log_channel_id
			const node = this.node ? common.nodes.byID(this.node) : void 0
			const undef = "undefined"
			const details = [
				["Tree", confprovider.config.cluster_id],
				["Guild ID", this.interaction?.guild_id ?? undef],
				["Text Channel", this.interaction?.channel.id ?? undef],
				["Voice Channel", this.voiceChannelID || undef],
				["Using Invidious", String(!!node?.search_with_invidious)],
				["Invidious Origin", `\`${node?.invidious_origin ?? "NONE"}\``],
				["Queue Node", this.node ?? "UNNAMED"]
			]
			if (track) {
				details.push(...[
					["Track", track.id],
					["Input", track.input],
					["Requester ID", track.requester.id],
					["Requester Tag", sharedUtils.userString(track.requester)]
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
			})
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
					description: langReplace(this.lang.GLOBAL.SONG_NOT_OBJECT, { "song": track }),
					color: 0xdd2d2d
				})
			}

			if (this.errorChain === 3) {
				if (!this._interactionExpired && this.interaction) {
					snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, {
						embeds: [
							{
								title: this.lang.GLOBAL.TOO_MANY_ERRORS,
								url: serverURL,
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

	public sendToSubscribedSessions<M extends
	"onTrackAdd" | "onTrackRemove" | "onTrackUpdate"
	| "onClearQueue" | "onNext" | "onListenersUpdate" | "onAttributesChange" | "onTimeUpdate" | "onStop"
	| "sendState"
	>(method: M, ...args: Parameters<Session[M]>): void {
		const inGuild = sessionGuildIndex.get(this.guildID)
		// @ts-expect-error The args are mapped correctly dw
		inGuild?.forEach(s => sessions.get(s)![method](...args))
	}

	public async voiceStateUpdate(packet: GatewayVoiceState): Promise<void> {
		if (packet.channel_id && packet.user_id === confprovider.config.client_id) {
			if (!this.createResolveCallback) {
				console.error("Amanda joined the VC before a callback was set. Likely a race condition with rejection or new Queue is being called elsewhere")
				return
			}

			this.createResolveCallback()

			const [clientUser, states] = await Promise.all([
				sharedUtils.getUser(confprovider.config.client_id, snow),
				redis.SMEMBERS(`vcs.${this.voiceChannelID}`).then(mems => Promise.all(mems.map(mem => redis.GET<GatewayVoiceState>("voice", mem))))
			])

			if (clientUser) this.listeners.set(clientUser.id, clientUser)

			for (const state of states) {
				if (!state) continue
				if (this.listeners.has(state.user_id)) continue
				const user = await sharedUtils.getUser(state.user_id, snow)
				if (user && !user.bot) this.listeners.set(user.id, user)
			}

			this._lastFMSetTrack()

			this.sendToSubscribedSessions("onListenersUpdate", this.toJSON().members)
			return
		}

		// moving voice channels does not set the channel_id as null and then update
		if (!packet.channel_id && this.voiceChannelID && packet.user_id === confprovider.config.client_id) return this.destroy()

		if (packet.channel_id !== this.voiceChannelID && this.listeners.has(packet.user_id)) {
			this.listeners.delete(packet.user_id)
			if (this.listeners.size <= 1) this._onAllUsersLeave() // just Amanda
		}

		if (packet.channel_id === this.voiceChannelID && packet.user_id !== confprovider.config.client_id) {
			if (!packet.member?.user || packet.member.user.bot) return
			this.leaveTimeout.clear()
			if (this.leavingSoonID && this.interaction) {
				snow.interaction.deleteFollowupMessage(this.interaction.application_id, this.interaction.token, this.leavingSoonID)
			}
			this.leavingSoonID = void 0
			this.listeners.set(packet.member.user.id, packet.member.user)
		}

		this.sendToSubscribedSessions("onListenersUpdate", this.toJSON().members)
	}
}
