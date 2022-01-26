import Discord from "thunderstorm"
import c from "centra"
import entities from "entities"
import encoding from "@lavalink/encoding"

import passthrough from "../../passthrough"
const { constants, sync, frisky, config } = passthrough

const common = sync.require("./utils") as typeof import("./utils")

const logger = sync.require("../../utils/logger") as typeof import("../../utils/logger")
const timeUtils = sync.require("../../utils/time") as typeof import("../../utils/time")
const text = sync.require("../../utils/string") as typeof import("../../utils/string")

const AsyncValueCache = sync.require("../../utils/classes/AsyncValueCache") as typeof import("../../utils/classes/AsyncValueCache")

const stationData = new Map([
	["original", {
		title: "Frisky Radio: Original",
		queue: "Frisky Radio: Original",
		client_name: "frisky",
		url: "http://stream.friskyradio.com/frisky_mp3_hi", // 44100Hz 2ch 128k MP3
		beta_url: "http://stream.friskyradio.com/frisky_mp3_hi" // 44100Hz 2ch 128k MP3
	}],
	["deep", {
		title: "Frisky Radio: Deep",
		queue: "Frisky Radio: Deep",
		client_name: "deep",
		url: "http://deep.friskyradio.com/friskydeep_acchi", // 32000Hz 2ch 128k MP3 (!)
		beta_url: "http://deep.friskyradio.com/friskydeep_aachi" // 32000Hz 2ch 128k MP3 (!)
	}],
	["chill", {
		title: "Frisky Radio: Chill",
		queue: "Frisky Radio: Chill",
		client_name: "chill",
		url: "http://chill.friskyradio.com/friskychill_mp3_high", // 44100Hz 2ch 128k MP3
		beta_url: "https://stream.chill.friskyradio.com/mp3_high" // 44100Hz 2ch 128k MP3
	}],
	["classics", {
		title: "Frisky Radio: Classics",
		queue: "Frisky Radio: Classics",
		client_name: "classics",
		url: "https://stream.classics.friskyradio.com/mp3_high", // 44100Hz 2ch 128k MP3
		beta_url: "https://stream.classics.friskyradio.com/mp3_high" // 44100Hz 2ch 128k MP3
	}]
])

export abstract class Song {
	public title = ""
	public track = ""
	public lengthSeconds = -1
	public queueLine = ""
	public npUpdateFrequency = 0
	public noPauseReason = ""
	public error = ""
	public id = ""
	public live = false
	public thumbnail = { src: "", width: 0, height: 0 }
	public queue: import("./queue")
	public validated = false

	public constructor() {
		setImmediate(() => {
			if (!this.validated) this.validationError("must call validate() in constructor")
		})
	}

	public abstract toObject(): { class: string; id: string; title: string; length: number; thumbnail: typeof Song.prototype.thumbnail; live: boolean; }
	public abstract getProgress(time: number, paused: boolean): unknown
	public abstract getRelated(): Promise<Song[]>
	public abstract showRelated(): Promise<string | import("thunderstorm").MessageEmbed>
	public abstract showLink(): Promise<string>
	public abstract showInfo(): Promise<string | import("thunderstorm").MessageEmbed>
	public abstract prepare(): Promise<unknown>
	public abstract resume(): unknown
	public abstract destroy(): unknown

	public async getLyrics(): Promise<string | null> {
		const picked = common.genius.pickApart(this)
		if (!picked.artist || !picked.title) return null
		let lyrics
		try {
			lyrics = await common.genius.getLyrics(picked.title, picked.artist)
		} catch {
			lyrics = null
		}
		return lyrics
	}

	private validationError(message: string) {
		logger.error(`Song validation error: ${this.constructor.name} ${message}`)
	}

	public validate() {
		["id", "track", "title", "queueLine", "npUpdateFrequency", "getProgress", "getRelated", "showRelated", "showInfo", "toObject"].forEach(key => {
			if (!this[key]) this.validationError(`unset ${key}`)
		})

		if (typeof (this.lengthSeconds) != "number" || this.lengthSeconds < 0) this.validationError("unset lengthSeconds")
		if (!this.thumbnail.src) this.validationError("unset thumbnail src")
		if (this.live === null) this.validationError("unset live")
		this.validated = true
	}
}

export class YouTubeSong extends Song {
	public uploader: string | undefined
	public related: import("../../utils/classes/AsyncValueCache")<Array<{ title: string; videoId: string; lengthSeconds: number; author: string; }>>
	public prepareCache: import("../../utils/classes/AsyncValueCache")<void>

	public constructor(id: string, title: string, lengthSeconds: number, track: string | null = null, uploader: string | undefined = undefined) {
		super()

		this.id = id
		this.thumbnail = {
			src: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
			width: 320,
			height: 180
		}
		this.title = title
		this.uploader = uploader
		this.lengthSeconds = lengthSeconds
		this.track = track || "!"
		this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`
		this.npUpdateFrequency = 5000
		this.live = false

		this.related = new AsyncValueCache(
			() => {
				return c(`${this.getInvidiousOrigin()}/api/v1/videos/${this.id}`).send().then(async data => {
					const json = await data.json()
					return json.recommendedVideos.filter(v => v.lengthSeconds > 0).slice(0, 10)
				})
			})

		this.prepareCache = new AsyncValueCache(async () => {
			if (this.track == "!") {
				let tracks: Awaited<ReturnType<typeof common.loadtracks>> | undefined = undefined
				try {
					tracks = await common.loadtracks(`ytsearch:${this.id}`, this.queue.node)
				} catch (e) {
					this.error = e
				}
				if (!tracks || !tracks[0]) this.error = `No results for ID ${this.id}`
				else if (tracks[0] && !tracks[0].track) this.error = `Missing track for ID ${this.id}`
				else {
					this.track = tracks[0].track
					if (tracks[0].info) this.uploader = tracks[0].info.author
				}
			}
		})

		this.validate()
	}

	public toObject() {
		return {
			class: "YouTubeSong",
			id: this.id,
			title: this.title,
			lengthSeconds: this.lengthSeconds,
			track: this.track,
			uploader: this.uploader,
			length: this.lengthSeconds,
			thumbnail: this.thumbnail,
			live: this.live
		}
	}

	public getProgress(time: number, paused: boolean) {
		const max = this.lengthSeconds
		const rightTime = timeUtils.prettySeconds(max)
		if (time > max) time = max
		const leftTime = timeUtils.prettySeconds(time)
		const bar = text.progressBar(18, time, max, paused ? " [PAUSED] " : "")
		return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
	}

	public async getRelated() {
		const related = await this.related.get().catch(() => [] as Awaited<ReturnType<typeof this.related.get>>)
		return related.map(v => new YouTubeSong(v.videoId, v.title, v.lengthSeconds))
	}

	public async showRelated() {
		let related: Awaited<ReturnType<typeof this.related.get>>
		try {
			related = await this.related.get()
		} catch {
			return `Invidious didn't return valid data.\
				\n<${this.getInvidiousOrigin()}/api/v1/videos/${this.id}>\
				\n<${this.getInvidiousOrigin()}/v/${this.id}>\
				\n<https://youtu.be/${this.id}>`
		}

		if (related.length) {
			return new Discord.MessageEmbed()
				.setTitle("Related content from YouTube")
				.setDescription(
					related.map((v, i) =>
						`${i + 1}. **${Discord.Util.escapeMarkdown(v.title)}** (${timeUtils.prettySeconds(v.lengthSeconds)})`
					+ `\n — ${v.author}`
					)
				)
				.setFooter("Play one of these? &music related play <number>, or &m rel p <number>")
				.setColor(constants.standard_embed_color)
		} else {
			return "No related content available for the current song."
		}
	}

	public getInvidiousOrigin() {
		return this.queue.node ? common.nodes.byID(this.queue.node)?.invidious_origin || common.nodes.random().invidious_origin : common.nodes.random().invidious_origin
	}

	public showLink() {
		return this.showInfo()
	}

	public showInfo() {
		return Promise.resolve(`https://www.youtube.com/watch?v=${this.id}`)
	}

	public prepare() {
		return this.prepareCache.get()
	}

	public resume() {
		return Promise.resolve()
	}

	public destroy() {
		void 0
	}
}

export default exports as typeof import("./songtypes")
