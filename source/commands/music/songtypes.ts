const entities = require("entities") as typeof import("entities")
const encoding = require("@lavalink/encoding") as typeof import("@lavalink/encoding")

import passthrough from "../../passthrough"
const { constants, sync, frisky } = passthrough

const common = sync.require("./utils") as typeof import("./utils")

const logger = sync.require("../../utils/logger") as typeof import("../../utils/logger")
const timeUtils = sync.require("../../utils/time") as typeof import("../../utils/time")
const text = sync.require("../../utils/string") as typeof import("../../utils/string")
const arrUtils = sync.require("../../utils/array") as typeof import("../../utils/array")

const AsyncValueCache = sync.require("../../utils/classes/AsyncValueCache") as typeof import("../../utils/classes/AsyncValueCache")

const stationData = new Map<"original" | "deep" | "chill" | "classics", { title: string; queue: string; client_name: string; url: string; beta_url: string; }>([
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
	public queue: import("./queue") | undefined
	public validated = false

	public constructor() {
		setImmediate(() => {
			if (!this.validated) this.validationError("must call validate() in constructor")
		})
	}

	public abstract getRelated(): Promise<Song[]>
	public abstract showRelated(): Promise<string | import("discord-typings").Embed>
	public abstract showLink(): Promise<string>
	public abstract showInfo(): Promise<string | import("discord-typings").Embed>
	public abstract prepare(): Promise<unknown>
	public abstract resume(): unknown
	public abstract destroy(): unknown

	public toObject() {
		return {
			class: this.constructor.name,
			id: this.id,
			title: this.title,
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
		["id", "track", "title", "queueLine", "npUpdateFrequency", "getRelated", "showRelated", "showInfo"].forEach(key => {
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
				return fetch(`${this.getInvidiousOrigin()}/api/v1/videos/${this.id}`).then(async data => {
					const json = await data.json()
					return json.recommendedVideos.filter(v => v.lengthSeconds > 0).slice(0, 10)
				})
			})

		this.prepareCache = new AsyncValueCache(async () => {
			if (this.track == "!") {
				let tracks: Awaited<ReturnType<typeof common.loadtracks>> | undefined = undefined
				try {
					tracks = await common.loadtracks(`ytsearch:${this.id}`, this.queue?.node)
				} catch (e) {
					this.error = e
					return
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
			return {
				title: "Related content from YouTube",
				description: related.map((v, i) =>
					`${i + 1}. **${v.title}** (${timeUtils.prettySeconds(v.lengthSeconds)})`
					+ `\n — ${v.author}`
				).join("\n"),
				footer: {
					text: "Play one of these? &music related play <number>, or &m rel p <number>"
				},
				color: constants.standard_embed_color
			} as import("discord-typings").Embed
		} else return "No related content available for the current song."
	}

	public getInvidiousOrigin() {
		return this.queue && this.queue.node ? common.nodes.byID(this.queue.node)?.invidious_origin || common.nodes.random().invidious_origin : common.nodes.random().invidious_origin
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

export class FriskySong extends Song {
	public station: import("../../types").InferMapK<typeof stationData>
	public stationData: import("../../types").InferMapV<typeof stationData>
	public friskyStation: import("frisky-client/lib/Station")
	public stationInfoGetter: import("../../utils/classes/AsyncValueCache")<import("frisky-client/lib/Stream")>
	public bound: (() => Promise<void>) | undefined

	private _filledBarOffset: number

	public constructor(station: import("../../types").InferMapK<typeof stationData>, track?: string) {
		super()

		this.station = station

		if (!stationData.has(this.station)) throw new Error(`Unsupported station: ${this.station}`)
		this.stationData = stationData.get(this.station)!

		this.id = `frisky/${this.station}` // designed for error reporting
		this.thumbnail = {
			src: constants.frisky_placeholder,
			width: 320,
			height: 180
		}
		this.title = this.stationData.title
		this.queueLine = `**${this.stationData.queue}** (LIVE)`
		if (track) this.track = track
		else {
			const url = this.station === "chill" ? this.stationData.url : this.stationData.beta_url
			this.track = encoding.encode({
				flags: 1,
				version: 2,
				title: "Frisky Radio",
				author: "Feeling Frisky?",
				length: BigInt(0),
				identifier: url,
				isStream: true,
				uri: url,
				source: "http",
				position: BigInt(0)
			})
		}
		this.lengthSeconds = 0
		this.npUpdateFrequency = 15000
		this.noPauseReason = "You can't pause live radio."
		this.live = true

		this.friskyStation = frisky.managers.stream.stations.get(this.stationData.client_name)!
		this.stationInfoGetter = new AsyncValueCache(() => new Promise((resolve, reject) => {
			let attempts = 0

			const attempt = () => {
				const retry = (reason: string) => {
					if (attempts < 5) {
						setTimeout(() => {
							attempt()
						}, 1000)
					} else {
						reject(reason)
					}
				}

				attempts++
				const index = this.friskyStation.findNowPlayingIndex()
				if (index == null) return retry("Current item is unknown")
				const stream = this.friskyStation.getSchedule()[index]
				if (!stream) return retry("Current stream not available")
				if (!stream.mix) return retry("Current mix not available")
				if (!stream.mix.data) return retry("Current mix data not available")
				const episode = stream.mix.episode
				if (!episode) return retry("Current episode not available")
				if (!episode.data) return retry("Current episode data not available")
				return resolve(stream)
			}
			attempt()
		}))

		this._filledBarOffset = 0

		this.validate()
	}

	public getRelated() {
		return Promise.resolve([])
	}

	public showRelated() {
		return Promise.resolve("Try the other stations on Frisky Radio! `&frisky`, `&frisky deep`, `&frisky chill`")
	}

	public async showLink() {
		try {
			const stream = await this.stationInfoGetter.get()
			return `https://beta.frisky.fm/mix/${stream.mix!.id}`
		} catch {
			return "https://beta.frisy.fm"
		}
	}

	public async showInfo() {
		let stream: import("frisky-client/lib/Stream")
		try {
			stream = await this.stationInfoGetter.get()
		} catch {
			return "Unfortunately, we failed to retrieve information about the current song."
		}
		const mix = stream.mix!
		const stationCase = this.station[0].toUpperCase() + this.station.slice(1).toLowerCase()
		let percentPassed = Math.floor(((-stream.getTimeUntil()) / (stream.data!.duration * 1000)) * 100)
		if (percentPassed < 0) percentPassed = 0
		if (percentPassed > 100) percentPassed = 100
		const embed: import("discord-typings").Embed = {
			color: constants.standard_embed_color,
			title: `FRISKY: ${mix.data!.title}`,
			url: `https://beta.frisky.fm/mix/${mix.id}`,
			fields: [
				{
					name: "Details",
					value: arrUtils.tableifyRows(
						[
							["Episode", `${mix.data!.title} / [view](https://beta.frisky.fm/mix/${mix.id})`],
							["Show", `${mix.data!.title.split(" - ")[0]} / [view](https://beta.frisky.fm/shows/${mix!.data!.show_id.id})`],
							["Genre", mix.data!.genre.join(", ")],
							["Station", stationCase],
							["Schedule", `started ${timeUtils.shortTime(-stream.getTimeUntil(), "ms", ["d", "h", "m"])} ago, ${timeUtils.shortTime(stream.getTimeUntil() + stream.data!.duration * 1000, "ms", ["d", "h", "m"])} remaining (${percentPassed}%)`]
						],
						["left", "none"],
						() => "`"
					).join("\n")
				}
			]
		}

		if (mix.episode) embed.thumbnail = { url: this.thumbnail.src }
		if (mix.data!.track_list && mix.data!.track_list.length) {
			let trackList = mix.data!.track_list
				.slice(0, 6)
				.map(track => `${track.artist} - ${track.title}`)
				.join("\n")
			const hidden = mix.data!.track_list.length - 6
			if (hidden > 0) trackList += `\n_and ${hidden} more..._`
			embed.fields!.push({ name: "Track list", value: trackList })
		}
		return embed
	}


	public getProgress(time: number) {
		const part = "= ⋄ ==== ⋄ ==="
		const fragment = part.substring(7 - this._filledBarOffset, 7)
		const bar = `${fragment.repeat(3)}` // SC: ZWSP x 2
		this._filledBarOffset++
		if (this._filledBarOffset >= 7) this._filledBarOffset = 0
		return `\`[ ${timeUtils.prettySeconds(time)} ​${bar}​ LIVE ]\`` // SC: ZWSP x 2
	}

	public async prepare() {
		if (!this.bound) {
			this.bound = this.stationUpdate.bind(this)
			this.friskyStation.events.addListener("changed", this.bound)
			await this.stationUpdate()
		}
		return Promise.resolve()
	}

	public async stationUpdate() {
		this.stationInfoGetter.clear()
		const stream = await this.stationInfoGetter.get()
		const mix = stream.mix!
		// console.log(mix)
		this.title = mix.data!.title
		this.thumbnail.src = mix.episode!.data!.album_art.url
		this.thumbnail.width = mix.episode!.data!.album_art.thumb_width
		this.thumbnail.height = mix.episode!.data!.album_art.thumb_height
		/* if (this.queue) {
			const index = this.queue.songs.indexOf(this)
			if (index !== -1) ipc.replier.sendSongUpdate(this.queue, this, index)
		}*/
	}

	public resume() {
		return this.prepare()
	}

	public destroy() {
		if (this.bound) this.friskyStation.events.removeListener("changed", this.bound)
	}
}

export class SoundCloudSong extends Song {
	public artist: string
	public trackNumber: string
	public uri: string

	public constructor(data: import("../../types").LavalinkInfo, track: string) {
		super()
		this.title = data.title
		this.track = track
		this.artist = data.author
		this.lengthSeconds = Math.floor(data.length / 1000)
		this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`
		this.npUpdateFrequency = 5000
		this.error = ""
		this.trackNumber = data.identifier.match(/soundcloud:tracks:(\d+)/)?.[1] || "unknown"
		this.id = `sc/${this.trackNumber}`
		this.live = data.isStream || false
		this.thumbnail = {
			src: constants.soundcloud_placeholder,
			width: 616,
			height: 440
		}
		this.uri = data.uri

		this.validate()
	}

	public getRelated() {
		return Promise.resolve([])
	}

	public showRelated() {
		return Promise.resolve("Try finding related songs on SoundCloud.")
	}

	public showLink() {
		return this.showInfo()
	}

	public showInfo() {
		return Promise.resolve(this.uri)
	}

	public destroy(): void {
		void 0
	}

	public prepare(): Promise<void> {
		return Promise.resolve(void 0)
	}

	public resume() {
		void 0
	}
}

export class ExternalSong extends Song {
	public uri: string

	private _filledBarOffset: number

	public constructor(link: string) {
		super()

		const to = new URL(link)
		let name: string
		const pathnamereg = /\/?(\w+)\.\w+/
		if (!to.pathname.match(pathnamereg)) name = "Unknown Track"
		else name = to.pathname.match(pathnamereg)![1]
		this.title = entities.decodeHTML(name.replace(/_/g, " "))
		this.live = true
		this.thumbnail = {
			src: constants.local_placeholder,
			width: 512,
			height: 512
		}
		this.uri = link
		this.track = "!"
		this.lengthSeconds = 0
		this.npUpdateFrequency = 15000
		this.queueLine = `**${this.title}** (LIVE)`
		this.noPauseReason = "You can't pause external audio."
		this.id = String(Date.now())
		this._filledBarOffset = 0

		this.validate()
	}

	public async prepare() {
		let info: Array<{ track: string; info: import("../../types").LavalinkInfo; }>
		try {
			info = await common.loadtracks(this.uri, this.queue?.node)
		} catch (e) {
			this.error = e
			return
		}

		if (!Array.isArray(info) || !info || !info[0] || !info[0].track) this.error = `Missing track for ${this.title}`
		else {
			this.track = info[0].track
			if (info[0].info.isSeekable) {
				this.live = false
				this.lengthSeconds = Math.round(info[0].info.length / 1000)
				this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`
				this.noPauseReason = ""
			}
		}
	}

	public getRelated() {
		return Promise.resolve([])
	}

	public showRelated() {
		return Promise.resolve("Try finding related songs on other websites")
	}

	public showLink() {
		return Promise.resolve(this.uri)
	}

	public showInfo() {
		return this.showLink()
	}

	public getProgress(time: number, paused: boolean) {
		let bar: string
		const leftTime = timeUtils.prettySeconds(time)
		const rightTime = this.live ? "LIVE" : timeUtils.prettySeconds(this.lengthSeconds)
		if (this.live) {
			const part = "= ⋄ ==== ⋄ ==="
			const fragment = part.substring(7 - this._filledBarOffset, 7)
			bar = `${fragment.repeat(3)}` // SC: ZWSP x 2
			this._filledBarOffset++
			if (this._filledBarOffset >= 7) this._filledBarOffset = 0
		} else {
			if (time > this.lengthSeconds) time = this.lengthSeconds
			bar = text.progressBar(18, time, this.lengthSeconds, paused ? " [PAUSED] " : "")
		}
		return `\`[ ${leftTime} ​${bar}​ ${rightTime} ]\`` // SC: ZWSP x 2
	}

	public resume() {
		return this.prepare()
	}

	public destroy() {
		void 0
	}
}

export class ListenMoeSong extends Song {
	public station: "jp" | "kp"
	public stationData: import("listensomemoe")
	public uri: string
	public bound: ((track: import("listensomemoe/dist/Types").Track) => unknown) | undefined

	private _filledBarOffset = 0

	public constructor(station: "jp" | "kp") {
		super()

		this.station = station
		this.stationData = passthrough.listenMoe[station]
		this.live = true
		this.lengthSeconds = this.stationData.nowPlaying.duration
		this.id = this._id
		this.title = this.stationData.nowPlaying.title
		this.queueLine = `**${this.title}** (${this.lengthSeconds ? timeUtils.prettySeconds(this.lengthSeconds) : "LIVE"})`
		this.thumbnail = {
			src: constants.listen_moe_placeholder,
			width: 64,
			height: 64
		}
		this.uri = this.stationData.Constants.STREAM_URLS[station === "jp" ? "JPOP" : "KPOP"].opus
		this.track = encoding.encode({
			flags: 1,
			version: 2,
			title: "Listen.moe",
			author: "Delivering the best JPOP and KPOP music around!",
			length: BigInt(0),
			identifier: this.uri,
			isStream: true,
			uri: this.uri,
			source: "http",
			position: BigInt(0)
		})
		this.npUpdateFrequency = 15000
		this.noPauseReason = "You can't pause live audio."

		this.validate()
	}

	private get _id() {
		return String((this.stationData.nowPlaying.albums && this.stationData.nowPlaying.albums[0] ? (this.stationData.nowPlaying.albums[0].id || this.stationData.nowPlaying.id) : this.stationData.nowPlaying.id))
	}

	public prepare() {
		if (!this.bound) {
			this.bound = this.stationUpdate.bind(this)
			this.stationData.on("trackUpdate", this.bound)
		}
		return Promise.resolve()
	}

	public getRelated() {
		return Promise.resolve([])
	}

	public showRelated() {
		return Promise.resolve("Try the other stations on <https://listen.moe>")
	}

	public showLink() {
		return Promise.resolve(`https://listen.moe/albums/${this.id}`)
	}

	public async showInfo() {
		const link = await this.showLink()
		return `https://listen.moe\n${link}`
	}

	public getProgress(fallback: number) {
		let time: number
		if (this.stationData.lastTrackStartedAt) time = Math.floor((Date.now() - this.stationData.lastTrackStartedAt) / 1000)
		else time = fallback
		const part = "= ⋄ ==== ⋄ ==="
		const fragment = part.substring(7 - this._filledBarOffset, 7)
		let bar: string
		if (!this.lengthSeconds) bar = `${fragment.repeat(3)}` // SC: ZWSP x 2
		else {
			if (time > this.lengthSeconds) time = this.lengthSeconds
			bar = text.progressBar(18, time, this.lengthSeconds)
		}
		this._filledBarOffset++
		if (this._filledBarOffset >= 7) this._filledBarOffset = 0
		return `\`[ ${timeUtils.prettySeconds(time)} ​${bar}​ ${this.lengthSeconds ? timeUtils.prettySeconds(this.lengthSeconds) : "LIVE"} ]\`` // SC: ZWSP x 2
	}

	public resume() {
		return this.prepare()
	}

	public destroy() {
		if (this.bound) this.stationData.removeListener("trackUpdate", this.bound)
	}

	public stationUpdate(track: import("listensomemoe/dist/Types").Track) {
		this.title = track.title
		this.lengthSeconds = track.duration
		this.id = this._id
		this.queueLine = `**${this.title}** (${this.lengthSeconds ? timeUtils.prettySeconds(this.lengthSeconds) : "LIVE"})`
	}
}

export class NewgroundsSong extends Song {
	public author: string
	public uri: string
	public streamURL: string

	public constructor(data: { href: string; author: string; title: string; id: number; mp3URL: string; duration: number; track?: string; }) {
		super()

		this.title = data.title
		this.author = data.author
		this.uri = data.href
		this.streamURL = data.mp3URL
		this.id = String(data.id)
		this.live = false
		this.lengthSeconds = data.duration
		this.thumbnail = {
			src: constants.newgrounds_placeholder,
			width: 1200,
			height: 1200
		}
		this.track = data.track || "!"
		this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`
		this.npUpdateFrequency = 5000
		this.error = ""

		this.validate()
	}

	public getRelated() {
		return Promise.resolve([])
	}

	public showRelated() {
		return Promise.resolve("Try finding related songs on NewGrounds")
	}

	public async prepare() {
		if (this.track && this.track != "!") return
		let data: Array<{ track: string; info: import("../../types").LavalinkInfo; }>
		try {
			data = await common.loadtracks(this.streamURL, this.queue?.node)
		} catch (e) {
			this.error = e
			return
		}
		if (!Array.isArray(data) || !data || !data[0] || !data[0].track) this.error = `Missing track for ${this.title}`
		else this.track = data[0].track
	}

	public showLink() {
		return Promise.resolve(this.uri)
	}

	public showInfo() {
		return this.showLink()
	}

	public destroy() {
		void 0
	}

	public resume() {
		return this.prepare()
	}
}

// Just for name parity
export class TwitterSong extends Song {
	public uri: string
	public displayURI: string

	public constructor(data: { title: string; uri: string; displayURI: string; }) {
		super()

		this.track = "!"
		this.title = data.title
		this.uri = data.uri
		this.displayURI = data.displayURI
		this.live = false
		this.lengthSeconds = 0

		const match = this.displayURI.match(/\/status\/(\d+)/)
		if (match && match[1]) this.id = `tw/${match[1]}`
		else this.id = `tw/${this.displayURI}`

		this.thumbnail = {
			src: constants.twitter_placeholder,
			width: 1066,
			height: 877
		}
		this.queueLine = `**${this.title}** (LOADING)`
		this.npUpdateFrequency = 5000
		this.error = ""

		this.validate()
	}

	public getRelated() {
		return Promise.resolve([])
	}

	public showRelated() {
		return Promise.resolve("Try finding related Tweets on Twitter")
	}

	public async prepare() {
		if (this.track && this.track != "!") return
		let data: Array<{ track: string; info: import("../../types").LavalinkInfo; }>
		try {
			data = await common.loadtracks(this.uri, this.queue?.node)
		} catch (e) {
			this.error = e
			return
		}

		if (!Array.isArray(data) || !data || !data[0] || !data[0].track) this.error = `Missing track for ${this.title}`
		else {
			this.track = data[0].track
			this.lengthSeconds = Math.round(data[0].info.length / 1000)
			this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`
		}
	}

	public showLink() {
		return Promise.resolve(this.displayURI)
	}

	public showInfo() {
		return this.showLink()
	}

	public destroy() {
		void 0
	}

	public resume() {
		return this.prepare()
	}
}

export class iTunesSong extends YouTubeSong {
	public ytID: string
	public artist: string
	public trackViewURL: string

	public constructor(data: import("../../types").iTunesSearchResult) {
		super("!", data.trackName, Math.floor(data.trackTimeMillis / 1000))

		this.live = false
		this.id = `appl/${data.trackId}`
		this.ytID = "!"
		this.artist = data.artistName
		this.trackViewURL = data.trackViewUrl

		this.thumbnail = {
			src: data.artworkUrl100,
			width: 100,
			height: 100
		}
		this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`
		this.npUpdateFrequency = 5000
		this.error = ""

		this.prepareCache = new AsyncValueCache(async () => {
			if (this.ytID == "!" || this.track == "!") {
				let tracks: Awaited<ReturnType<typeof common.loadtracks>>
				try {
					tracks = await common.loadtracks(`ytsearch:${this.artist} - ${this.title}`, this.queue?.node)
				} catch (e) {
					this.error = e
					return
				}
				if (!tracks[0]) this.error = `No results for ${this.title}`
				let decided = tracks[0]
				const found = tracks.find(item => item.info && item.info.author.includes("- Topic"))
				if (found) decided = found
				if (decided && decided.track) {
					this.ytID = decided.info.identifier
					this.lengthSeconds = Math.round(decided.info.length / 1000)
					this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`
					this.track = decided.track
				} else this.error = `Missing track for ${this.title}`
			}
		})

		this.validate()
	}

	public getRelated() {
		return Promise.resolve([])
	}

	public showRelated() {
		return Promise.resolve("Try finding related songs on iTunes.")
	}

	public showLink() {
		return Promise.resolve(this.trackViewURL)
	}

	public async showInfo() {
		const iT = await this.showLink()
		const YT = `https://www.youtube.com/watch?v=${this.ytID}`
		return Promise.resolve(`${iT}\n${YT}`)
	}

	public prepare() {
		return this.prepareCache.get()
	}
}

export class SpotifySong extends YouTubeSong {
	public url: string

	public constructor(data: { track?: string; youtubeID?: string; url: string; name?: string; artist?: string; icon?: string; duration?: number; }) {
		super(data.youtubeID || "!", data.name || "Unknown Spotify track (pending fetch)", Math.floor((data.duration || 0) * 1000))
		this.live = false
		this.thumbnail = { src: data.icon || constants.spotify_placeholder, width: 386, height: 386 }
		this.url = data.url
		this.uploader = data.artist
		this.prepareCache = new AsyncValueCache(async () => {
			const getFromYouTube = () => {
				return common.loadtracks(`${this.uploader} - ${this.title}`, this.queue?.node).then(tracks => {
					if (!tracks[0]) this.error = `No results for ${this.title}`
					let decided = tracks[0]
					const found = tracks.find(item => item.info && item.info.author.includes("- Topic"))
					if (found) decided = found
					if (decided && decided.track) {
						this.id = decided.info.identifier
						this.lengthSeconds = Math.round(decided.info.length / 1000)
						this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`
						this.track = decided.track
					} else this.error = `Missing track for ${this.title}`
				}).catch(message => {
					this.error = message
				})
			}
			if (this.id == "!" || this.track == "!") {
				if (this.title && this.uploader) await getFromYouTube()
				else {
					const d = await common.loadtracks(this.url).catch(() => void 0)
					if (!d || !d.length) {
						this.error = "Cannot extract Spotify info"
						return
					}
					const track = d[0]
					this.title = track.info.title
					this.uploader = track.info.author
					await getFromYouTube()
				}
			}
		})

		this.validate()
	}

	public getRelated() {
		return Promise.resolve([])
	}

	public showRelated() {
		return Promise.resolve("Try finding related songs on Spotify.")
	}

	public showLink() {
		return Promise.resolve(this.url)
	}

	public async showInfo() {
		const SP = await this.showLink()
		const YT = await super.showInfo()
		return Promise.resolve(`${SP}\n${YT}`)
	}

	public prepare() {
		return this.prepareCache.get()
	}
}

export default exports as typeof import("./songtypes")
