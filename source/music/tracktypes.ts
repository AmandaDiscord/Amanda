const encoding = require("@lavalink/encoding") as typeof import("@lavalink/encoding")

import passthrough from "../passthrough"
const { constants, sync, frisky } = passthrough

const common = sync.require("./utils") as typeof import("./utils")

const timeUtils = sync.require("../client/utils/time") as typeof import("../client/utils/time")
const text = sync.require("../client/utils/string") as typeof import("../client/utils/string")
const arrUtils = sync.require("../client/utils/array") as typeof import("../client/utils/array")
const language = sync.require("../client/utils/language") as typeof import("../client/utils/language")

const AsyncValueCache = sync.require("./classes/AsyncValueCache") as typeof import("./classes/AsyncValueCache")

const friskyStationData = new Map<"original" | "deep" | "chill" | "classics", { title: string; queue: string; client_name: string; url: string; beta_url: string; }>([
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

const radioStations = new Map<string, Array<any>>([
	["jpop", [

	]],
	["vocaloid", [

	]]
])

export class Track {
	public title: string
	public author: string
	public track: string
	public lengthSeconds: number
	public queueLine: string
	public npUpdateFrequency = 15000
	public noPauseReason = ""
	public error = ""
	public id: string
	public live: boolean
	public thumbnail = { src: "", width: 0, height: 0 }
	public queue: import("./queue").Queue | undefined
	public source: string
	public uri: string | null
	public input: string
	public requester: import("discord-api-types/v10").APIUser
	public lang: import("@amanda/lang").Lang

	private _filledBarOffset = 0

	public constructor(track: string, info: Partial<import("@lavalink/encoding").TrackInfo>, input: string, requester: import("discord-api-types/v10").APIUser, lang: import("@amanda/lang").Lang) {
		this.lang = lang
		this.track = track
		this.title = info.title || lang.GLOBAL.UNKNOWN_TRACK
		this.author = info.author || lang.GLOBAL.UNKNOWN_AUTHOR
		this.lengthSeconds = Math.round(Number(info.length || 0) / 1000)
		this.id = info.identifier || "!"
		this.live = info.isStream || false
		this.source = info.source || lang.GLOBAL.HEADER_UNKNOWN
		this.uri = info.uri || null
		this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`

		this.input = input
		this.requester = requester
	}

	public showLink(): Promise<string> {
		return Promise.resolve("https://amanda.moe")
	}

	public showInfo(): Promise<string | import("discord-api-types/v10").APIEmbed> {
		return Promise.resolve((this.queue?.lang || this.lang).GLOBAL.SONG_INFO_GENERIC)
	}

	public prepare(): Promise<unknown> {
		return Promise.resolve(void 0)
	}

	public resume(): unknown {
		return void 0
	}

	public destroy(): unknown {
		return void 0
	}

	public toObject() {
		return {
			class: this.constructor.name,
			id: this.id,
			title: this.title,
			length: this.lengthSeconds,
			thumbnail: this.thumbnail,
			live: this.live,
			uri: this.uri,
			source: this.source,
			author: this.author
		}
	}

	public getProgress(time: number, paused: boolean) {
		if (!this.live) {
			const max = this.lengthSeconds
			const rightTime = timeUtils.prettySeconds(max)
			if (time > max) time = max
			const leftTime = timeUtils.prettySeconds(time)
			const bar = text.progressBar(18, time, max, paused ? ` [${(this.queue?.lang || this.lang).GLOBAL.HEADER_PAUSED}] ` : "")
			return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
		} else {
			const part = "= ⋄ ==== ⋄ ==="
			const fragment = part.substr(7 - this._filledBarOffset, 7)
			const bar = `${fragment.repeat(3)}` // SC: ZWSP x 2
			this._filledBarOffset++
			if (this._filledBarOffset >= 7) this._filledBarOffset = 0
			return `\`[ ${timeUtils.prettySeconds(time)} ​${bar}​ ${(this.queue?.lang || this.lang).GLOBAL.HEADER_LIVE} ]\`` // SC: ZWSP x 2
		}
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
}

export class RequiresSearchTrack extends Track {
	public prepareCache: import("./classes/AsyncValueCache").AsyncValueCache<void>
	private searchString: string

	public constructor(track: string | null = null, info: Partial<import("@lavalink/encoding").TrackInfo>, input: string, requester: import("discord-api-types/v10").APIUser, lang: import("@amanda/lang").Lang) {
		super(track || "!", info, input, requester, lang)
		this.searchString = info.identifier ? info.identifier : (info.author && info.title) ? `${info.author} - ${info.title}` : info.title || ""
		this.queueLine = `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`

		this.prepareCache = new AsyncValueCache.AsyncValueCache(async () => {
			let tracks: Awaited<ReturnType<typeof common.loadtracks>> | undefined = undefined
			try {
				tracks = await common.loadtracks(this.searchString, this.queue?.node)
			} catch (e) {
				this.error = e
				return
			}
			if (tracks && tracks.tracks[0] && tracks.tracks[0].track) {
				this.track = tracks.tracks[0].track
				if (tracks.tracks[0].info) this.author = tracks.tracks[0].info.author
			} else if (tracks.tracks[0] && !tracks.tracks[0].track) this.error = language.replace((this.queue?.lang || this.lang).GLOBAL.MISSING_TRACK, { "id": this.searchString })
			else this.error = (this.queue?.lang || this.lang).GLOBAL.NO_RESULTS
		})
	}

	public prepare() {
		return this.prepareCache.get()
	}
}

const pathnamereg = /\/?(\w+)\.\w+$/
const underscoreRegex = /_/g

export class ExternalTrack extends Track {
	public id = String(Date.now())
	public thumbnail = { src: constants.local_placeholder, width: 512, height: 512 }

	public constructor(track: string, info: Partial<import("@lavalink/encoding").TrackInfo>, input: string, requester: import("discord-api-types/v10").APIUser, lang: import("@amanda/lang").Lang) {
		super(track, info, input, requester, lang)

		const to = new URL(info.uri!)
		let name: string
		if (!info.title) {
			const match = to.pathname.match(pathnamereg)
			if (!match) name = lang.GLOBAL.UNKNOWN_TRACK
			else name = match[1]
			this.title = decodeEntities(name.replace(underscoreRegex, " "))
		}
		this.live = info.isStream || true
		this.queueLine = this.live ? `**${this.title}** (${this.lang.GLOBAL.HEADER_LIVE})` : `**${this.title}** (${timeUtils.prettySeconds(this.lengthSeconds)})`
		this.noPauseReason = this.live ? this.lang.GLOBAL.CANNOT_PAUSE_LIVE : this.noPauseReason
	}

	public async prepare() {
		if (this.track !== "!") return
		let info: Awaited<ReturnType<typeof common.loadtracks>>["tracks"]
		try {
			const data = await common.loadtracks(this.uri!, this.queue?.node)
			info = data.tracks
		} catch (e) {
			this.error = e
			return
		}

		if (!Array.isArray(info) || !info || !info[0] || !info[0].track) this.error = language.replace((this.queue?.lang || this.lang).GLOBAL.MISSING_TRACK, { "id": this.title })
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
}

export class FriskyTrack extends Track {
	public station: import("../types").InferMapK<typeof friskyStationData>
	public stationData: import("../types").InferMapV<typeof friskyStationData>
	public friskyStation: import("frisky-client/lib/Station")
	public stationInfoGetter: import("./classes/AsyncValueCache").AsyncValueCache<import("frisky-client/lib/Stream")>
	public bound: (() => Promise<void>) | undefined
	public live = true
	public thumbnail = { src: constants.frisky_placeholder, width: 320, height: 180 }

	public constructor(station: import("../types").InferMapK<typeof friskyStationData>, track: string | undefined, input: string, requester: import("discord-api-types/v10").APIUser, lang: import("@amanda/lang").Lang) {
		super(track || "!", { identifier: `frisky/${station}` }, input, requester, lang)

		this.station = station
		this.noPauseReason = lang.GLOBAL.CANNOT_PAUSE_LIVE

		if (!friskyStationData.has(this.station)) throw new Error(`Unsupported station: ${this.station}`)
		this.stationData = friskyStationData.get(this.station)!

		this.title = this.stationData.title
		this.queueLine = `**${this.stationData.queue}** (${this.lang.GLOBAL.HEADER_LIVE})`
		if (!track) {
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

		this.friskyStation = frisky.managers.stream.stations.get(this.stationData.client_name)!
		this.stationInfoGetter = new AsyncValueCache.AsyncValueCache(() => new Promise((resolve, reject) => {
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
	}

	public async showLink() {
		try {
			const stream = await this.stationInfoGetter.get()
			return `https://frisky.fm/mix/${stream.mix!.id}`
		} catch {
			return "https://frisy.fm"
		}
	}

	public async showInfo() {
		let stream: import("frisky-client/lib/Stream")
		try {
			stream = await this.stationInfoGetter.get()
		} catch {
			return (this.queue?.lang || this.lang).GLOBAL.SONG_INFO_FETCH_FAIL
		}
		const mix = stream.mix!
		const stationCase = this.station[0].toUpperCase() + this.station.slice(1).toLowerCase()
		let percentPassed = Math.floor(((-stream.getTimeUntil()) / (stream.data!.duration * 1000)) * 100)
		if (percentPassed < 0) percentPassed = 0
		if (percentPassed > 100) percentPassed = 100
		const embed: import("discord-api-types/v10").APIEmbed = {
			color: constants.standard_embed_color,
			title: `FRISKY: ${mix.data!.title}`,
			url: `https://frisky.fm/mix/${mix.id}`,
			fields: [
				{
					name: this.queue?.lang.GLOBAL.HEADER_DETAILS || this.lang.GLOBAL.HEADER_DETAILS,
					value: arrUtils.tableifyRows(
						[
							[(this.queue?.lang || this.lang).GLOBAL.HEADER_EPISODE || this.lang.GLOBAL.HEADER_EPISODE, `${mix.data!.title} / [Frisky](https://frisky.fm/mix/${mix.id})`],
							[(this.queue?.lang || this.lang).GLOBAL.HEADER_SHOW || this.lang.GLOBAL.HEADER_SHOW, `${mix.data!.title.split(" - ")[0]} / [Frisky](https://frisky.fm/shows/${mix!.data!.show_id.id})`],
							[(this.queue?.lang || this.lang).GLOBAL.HEADER_GENRE, mix.data!.genre.join(", ")],
							[(this.queue?.lang || this.lang).GLOBAL.HEADER_STATION, stationCase],
							[(this.queue?.lang || this.lang).GLOBAL.HEADER_SCHEDULE, language.replace((this.queue?.lang || this.lang).GLOBAL.SONG_STARTED_AND_REMAINING, { "ago": timeUtils.shortTime(-stream.getTimeUntil(), "ms", ["d", "h", "m"]), "remaining": timeUtils.shortTime(stream.getTimeUntil() + stream.data!.duration * 1000, "ms", ["d", "h", "m"]), "percent": percentPassed })]
						],
						["left", "none"],
						() => "`"
					).join("\n")
				}
			]
		}

		if (mix.episode) embed.thumbnail = { url: this.thumbnail.src }
		if (mix.data!.track_list && mix.data!.track_list.length) {
			const trackList = mix.data!.track_list
				.slice(0, 6)
				.map(track => `${track.artist} - ${track.title}`)
				.join("\n")
			embed.fields!.push({ name: (this.queue?.lang || this.lang).GLOBAL.HEADER_TRACK_LIST, value: trackList })
		}
		return embed
	}

	public async prepare() {
		if (!this.bound) {
			this.bound = this.stationUpdate.bind(this)
			this.friskyStation.events.addListener("changed", this.bound)
			await this.stationUpdate()
		}
		return Promise.resolve(void 0)
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
	}

	public resume() {
		return this.prepare()
	}

	public destroy() {
		if (this.bound) this.friskyStation.events.removeListener("changed", this.bound)
	}

	public getLyrics(): Promise<string | null> {
		return Promise.resolve("[Intro]\nFeeling frisky?\n\n[Verse ∞]\nFrisky...\n\n")
	}
}

export class ListenMoeTrack extends Track {
	public stationData: import("listensomemoe")
	public bound: ((track: import("listensomemoe/dist/Types").Track) => unknown) | undefined
	public thumbnail = { src: constants.listen_moe_placeholder, width: 64, height: 64 }

	public constructor(station: "jp" | "kp", input: string, requester: import("discord-api-types/v10").APIUser, lang: import("@amanda/lang").Lang) {
		const uri = passthrough.listenMoe[station].Constants.STREAM_URLS[station === "jp" ? "JPOP" : "KPOP"].opus
		const info = {
			flags: 1,
			version: 2,
			title: passthrough.listenMoe[station].nowPlaying.title,
			author: "Delivering the best JPOP and KPOP music around!",
			length: BigInt(passthrough.listenMoe[station].nowPlaying.duration),
			identifier: uri,
			isStream: true,
			uri: uri,
			source: "http",
			position: BigInt(0)
		}
		const track = encoding.encode(info)

		super(track, info, input, requester, lang)

		this.noPauseReason = lang.GLOBAL.CANNOT_PAUSE_LIVE
		this.stationData = passthrough.listenMoe[station]
		this.id = this._id
		this.queueLine = `**${this.title}** (${this.lengthSeconds ? timeUtils.prettySeconds(this.lengthSeconds) : this.lang.GLOBAL.HEADER_LIVE})`
	}

	private get _id() {
		return String((this.stationData.nowPlaying.albums && this.stationData.nowPlaying.albums[0] ? (this.stationData.nowPlaying.albums[0].id || this.stationData.nowPlaying.id) : this.stationData.nowPlaying.id))
	}

	public prepare() {
		if (!this.bound) {
			this.bound = this.stationUpdate.bind(this)
			this.stationData.on("trackUpdate", this.bound)
		}
		return Promise.resolve(void 0)
	}

	public showLink() {
		return Promise.resolve(`https://listen.moe/albums/${this.id}`)
	}

	public async showInfo() {
		const link = await this.showLink()
		return `https://listen.moe\n${link}`
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
		this.queueLine = `**${this.title}** (${this.lengthSeconds ? timeUtils.prettySeconds(this.lengthSeconds) : (this.queue?.lang || this.lang).GLOBAL.HEADER_LIVE})`
	}
}

// https://stackoverflow.com/questions/44195322/a-plain-javascript-way-to-decode-html-entities-works-on-both-browsers-and-node
const translateRegex = /&(nbsp|amp|quot|lt|gt);/g
const entityCodeRegex = /&#(\d+);/gi
function decodeEntities(encodedString: string) {
	const translate = {
		"nbsp": " ",
		"amp" : "&",
		"quot": "\"",
		"lt" : "<",
		"gt" : ">"
	}
	return encodedString.replace(translateRegex, function(_, entity) {
		return translate[entity]
	}).replace(entityCodeRegex, function(_, numStr) {
		const num = parseInt(numStr, 10)
		return String.fromCharCode(num)
	})
}

export default exports as typeof import("./tracktypes")