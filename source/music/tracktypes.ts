import passthrough = require("../passthrough")
const { constants, sync } = passthrough

const common = sync.require("./utils") as typeof import("./utils")

const timeUtils = sync.require("../client/utils/time") as typeof import("../client/utils/time")
const text = sync.require("../client/utils/string") as typeof import("../client/utils/string")
const arrUtils = sync.require("../client/utils/array") as typeof import("../client/utils/array")
const language = sync.require("../client/utils/language") as typeof import("../client/utils/language")

const AsyncValueCache = sync.require("./classes/AsyncValueCache") as typeof import("./classes/AsyncValueCache")

const feelingFrisky = "Feeling Frisky?"
const friskyLyrics = "[Intro]\nFeeling frisky?\n\n[Verse ∞]\nFrisky...\n\n[Chorus]\n<other lyrics and bloops>\n\n"

const radioStations = new Map<string, { [station: string]: { title: string; author: string; url: string; viewURL: string; lyrics?: string }}>([
	["frisky", {
		"original": {
			title: "Frisky Radio: Original",
			author: feelingFrisky,
			url: "http://stream.friskyradio.com/frisky_mp3_hi",
			viewURL: "https://frisky.fm",
			lyrics: friskyLyrics
		},
		"deep": {
			title: "Frisky Radio: Deep",
			author: feelingFrisky,
			url: "http://deep.friskyradio.com/friskydeep_aachi",
			viewURL: "https://frisky.fm",
			lyrics: friskyLyrics
		},
		"chill": {
			title: "Frisky Radio: Chill",
			author: feelingFrisky,
			url: "http://chill.friskyradio.com/friskychill_mp3_high",
			viewURL: "https://frisky.fm",
			lyrics: friskyLyrics
		},
		"classics": {
			title: "Frisky Radio: Classics",
			author: feelingFrisky,
			url: "https://stream.classics.friskyradio.com/mp3_high",
			viewURL: "https://frisky.fm",
			lyrics: friskyLyrics
		}
	}],
	["listenmoe", {
		"japanese": {
			title: "Listen.moe: Japanese",
			author: "Delivering the best JPOP and KPOP music around!",
			url: "https://listen.moe/opus",
			viewURL: "https://listen.moe"
		},
		"korean": {
			title: "Listen.moe: Korean",
			author: "Delivering the best JPOP and KPOP music around!",
			url: "https://listen.moe/kpop/opus",
			viewURL: "https://listen.moe"
		}
	}],
	["radionet", {
		"absolutechillout": {
			title: "Absolute Chillout",
			author: "Absolute Chillout",
			url: "https://streaming.live365.com/b05055_128mp3",
			viewURL: "https://www.radio.net/s/absolutechillout"
		},
		"swissjazz": {
			title: "Radio Swiss Jazz",
			author: "Radio Swiss Jazz",
			url: "https://stream.srg-ssr.ch/m/rsj/mp3_128",
			viewURL: "https://www.radio.net/s/swissjazz"
		},
		"yogachill": {
			title: "Yoga Chill",
			author: "VIP Chill",
			url: "https://radio4.vip-radios.fm:18027/stream-128kmp3-YogaChill",
			viewURL: "https://www.radio.net/s/vipyoga"
		},
		"therock": {
			title: "95.7 The Rock",
			author: "KMKO-FM",
			url: "https://live.wostreaming.net/direct/alphacorporate-kmkofmaac-imc4",
			viewURL: "https://www.radio.net/s/kmkofm"
		},
		"classiccountry": {
			title: "104.9 Classic Country",
			author: "Classic Country",
			url: "https://ice10.securenetsystems.net/OZARK",
			viewURL: "https://www.radio.net/s/classiccountry1049"
		},
		"thesurf": {
			title: "94.9 The Surf FM",
			author: "The Surf FM",
			url: "https://ice24.securenetsystems.net/WVCO",
			viewURL: "https://www.radio.net/s/949thesurffm"
		},
		"gayfm": {
			title: "Gay FM",
			author: "Gay FM",
			url: "https://icepool.silvacast.com/GAYFM.mp3",
			viewURL: "https://www.radio.net/s/gayfm"
		},
		"aardvarkblues": {
			title: "Aardvark Blues",
			author: "BluesFM",
			url: "https://streaming.live365.com/b77280_128mp3",
			viewURL: "https://www.radio.net/s/aardvarkblues"
		}
	}]
])
const radioStationGenres = new Map<string, Array<string>>([
	["jpop", ["listenmoe/japanese"]],
	["kpop", ["listenmoe/korean"]],
	["chillout", ["frisky/chill", "radionet/absolutechillout", "radionet/yogachill"]],
	["house", ["frisky/deep"]],
	["jazz", ["radionet/swissjazz"]],
	["rock", ["radionet/therock"]],
	["country", ["radionet/classiccountry"]],
	["oldies", ["radionet/thesurf"]],
	["electro", ["radionet/gayfm"]],
	["blues", ["radionet/aardvarkblues"]]
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
			const fragment = common.substr(part, 7 - this._filledBarOffset, 7)
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
		this.searchString = (info.author && info.title) ? `${info.author} - ${info.title}` : info.title || ""
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
				if (tracks.tracks[0].info && this.author === lang.GLOBAL.UNKNOWN_AUTHOR) this.author = tracks.tracks[0].info.author
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

export class RadioTrack extends RequiresSearchTrack {
	public thumbnail = { src: constants.local_placeholder, width: 512, height: 512 }
	public stationData: import("../types").UnpackRecord<import("../types").InferMap<typeof radioStations>["value"]>

	public constructor(station: string, requester: import("discord-api-types/v10").APIUser, lang: import("@amanda/lang").Lang) {
		const [namespace, substation] = station.split("/")
		const stationData = radioStations.get(namespace)?.[substation]
		if (!stationData) throw new Error("Invalid radio station")
		const info = {
			flags: 0,
			source: "http",
			identifier: stationData.url,
			length: BigInt(0),
			isStream: true,
			position: BigInt(0),
			title: stationData.url,
			uri: stationData.url,
			version: 1
		}
		super("!", info, station, requester, lang)
		this.title = stationData.title
		this.author = stationData.author
		this.stationData = stationData
		this.queueLine = `**${this.stationData.title}** (${this.lang.GLOBAL.HEADER_LIVE})`
	}

	public showLink() {
		return Promise.resolve(this.stationData.viewURL)
	}

	public async showInfo() {
		return `Try finding more radio stations like this one on ${await this.showLink()}`
	}

	public getLyrics() {
		return Promise.resolve(this.stationData.lyrics ?? null)
	}

	public static randomFromGenre(genre: string, requester: import("discord-api-types/v10").APIUser, lang: import("@amanda/lang").Lang): RadioTrack | null {
		const fromGenre = radioStationGenres.get(genre)
		if (!fromGenre?.length) return null
		return new RadioTrack(arrUtils.random(fromGenre), requester, lang)
	}

	public static random(requester: import("discord-api-types/v10").APIUser, lang: import("@amanda/lang").Lang) {
		const keys = Array.from(radioStationGenres.keys())
		const genre = arrUtils.random(keys)
		return RadioTrack.randomFromGenre(genre, requester, lang)!
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
