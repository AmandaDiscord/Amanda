import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")

import passthrough = require("../passthrough")
const { sync, confprovider, sessions, sessionGuildIndex } = passthrough

const common = sync.require("./utils") as typeof import("./utils")

import type { APIEmbed, APIUser } from "discord-api-types/v10"
import type { Queue } from "./queue"
import type { Lang } from "@amanda/lang"
import type { UnpackRecord, InferMap } from "@amanda/shared-types"
import type { TrackInfo, Track as LLTrack } from "lavalink-types/v4"

const feelingFrisky = "Feeling Frisky?"
const friskyLyrics = "[Intro]\nFeeling frisky?\n\n[Verse ∞]\nFrisky...\n\n[Chorus]\n<other lyrics and bloops>\n\n"

const radioStations = new Map<string, {
	[station: string]: {
		title: string;
		author: string;
		url: string;
		viewURL: string;
		lyrics?: string
	}}
>([
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
	public lengthSeconds: number
	public queueLine: string
	public npUpdateFrequency = 15000
	public noPauseReason = ""
	public error = ""
	public id: string
	public live: boolean
	public thumbnail = { src: confprovider.config.unknown_placeholder, width: 128, height: 128 }
	public queue: Queue | undefined
	public source: string
	public uri: string | null

	private _filledBarOffset = 0

	public constructor(
		public track: string,
		info: Partial<TrackInfo>,
		public input: string,
		public requester: APIUser,
		public lang: Lang
	) {
		this.title = info.title ?? lang.GLOBAL.UNKNOWN_TRACK
		this.author = info.author ?? lang.GLOBAL.UNKNOWN_AUTHOR
		this.lengthSeconds = Math.round(Number(info.length ?? 0) / 1000)
		this.id = info.identifier ?? "!"
		this.live = info.isStream ?? false
		this.source = info.sourceName ?? lang.GLOBAL.HEADER_UNKNOWN
		this.uri = info.uri ?? null
		this.queueLine = `**${this.title}** (${sharedUtils.prettySeconds(this.lengthSeconds)})`
		if (info.artworkUrl) this.thumbnail.src = info.artworkUrl
	}

	public showLink(): Promise<string> {
		return Promise.resolve(this.uri ?? "https://amanda.moe")
	}

	public showInfo(): Promise<string | APIEmbed> {
		return Promise.resolve(this.uri ?? (this.queue?.lang ?? this.lang).GLOBAL.SONG_INFO_GENERIC)
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

	public getProgress(time: number, paused: boolean): string {
		const lang = this.queue?.lang ?? this.lang
		if (!this.live) {
			const max = this.lengthSeconds
			const rightTime = sharedUtils.prettySeconds(max)
			if (time > max) time = max
			const leftTime = sharedUtils.prettySeconds(time)
			const bar = sharedUtils.progressBar(
				18,
				time,
				max,
				paused ? ` [${lang.GLOBAL.HEADER_PAUSED}] ` : ""
			)
			return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
		} else {
			const part = "= ⋄ ==== ⋄ ==="
			const fragment = sharedUtils.substr(part, 7 - this._filledBarOffset, 7)
			const bar = `${fragment.repeat(3)}` // SC: ZWSP x 2
			this._filledBarOffset++
			if (this._filledBarOffset >= 7) this._filledBarOffset = 0
			return `\`[ ${sharedUtils.prettySeconds(time)} ​${bar}​ ${lang.GLOBAL.HEADER_LIVE} ]\`` // SC: ZWSP x 2
		}
	}

	public async getLyrics(): Promise<string | null> {
		const picked = common.genius.pickApart(this)
		if (!picked.artist || !picked.title) return null
		let lyrics: string | null

		try {
			lyrics = await common.genius.getLyrics(picked.title, picked.artist)
			if (!lyrics && picked.artist && picked.confidence === 1) lyrics = await common.genius.getLyrics(picked.artist, picked.title)
		} catch {
			lyrics = null
		}

		return lyrics
	}
}

export class RequiresSearchTrack extends Track {
	public prepareCache: sharedUtils.AsyncValueCache<void>
	public searchString: string

	public constructor(
		track: string | null = null,
		info: Partial<TrackInfo>,
		input: string,
		requester: APIUser,
		lang: Lang
	) {
		super(track ?? "!", info, input, requester, lang)
		this.searchString = info.uri ?? info.identifier ?? (info.author && info.title) ? `${info.author} - ${info.title}` : info.title ?? ""
		this.queueLine = `**${this.title}** (${sharedUtils.prettySeconds(this.lengthSeconds)})`

		this.prepareCache = new sharedUtils.AsyncValueCache(async () => {
			let tracks: Awaited<ReturnType<typeof common.loadtracks>> | undefined
			try {
				if (!this.searchString.length) throw new Error("Cannot search track by empty string")
				tracks = await common.loadtracks(this.searchString, this.lang, this.queue?.node)
			} catch (e) {
				this.error = e.message
				return
			}

			let chosen: LLTrack | undefined
			if (tracks.loadType === "track") chosen = tracks.data
			else if (tracks.loadType === "playlist") chosen = tracks.data.tracks[0]
			else if (tracks.loadType === "search") chosen = tracks.data[0]

			if (chosen?.encoded) {
				this.track = chosen.encoded
				if (this.author === lang.GLOBAL.UNKNOWN_AUTHOR) this.author = chosen.info.author
				if (chosen.info.artworkUrl) this.thumbnail.src = chosen.info.artworkUrl

				if (this.queue) {
					const inGuild = sessionGuildIndex.get(this.queue.guildID)
					const index = this.queue.tracks.indexOf(this)
					inGuild?.forEach(s => sessions.get(s)!.onTrackUpdate(this, index))
				}
			} else if (chosen && !chosen.encoded) this.error = langReplace((this.queue?.lang ?? this.lang).GLOBAL.MISSING_TRACK, { "id": this.searchString })
			else this.error = (this.queue?.lang ?? this.lang).GLOBAL.NO_RESULTS
		})
	}

	public prepare(): Promise<void> {
		return this.prepareCache.get()
	}
}

const pathnamereg = /\/?(\w+)\.\w+$/
const underscoreRegex = /_/g

export class ExternalTrack extends Track {
	public id = String(Date.now())
	public thumbnail = { src: confprovider.config.local_placeholder, width: 512, height: 512 }

	public constructor(
		track: string,
		info: Partial<TrackInfo>,
		input: string,
		requester: APIUser,
		lang: Lang
	) {
		super(track, info, input, requester, lang)

		if (!info.title || info.title === "Unknown title") {
			const to = new URL(info.uri!)
			let name = ""
			const match = pathnamereg.exec(to.pathname)
			if (!match) name = lang.GLOBAL.UNKNOWN_TRACK
			else name = match[1]
			this.title = decodeEntities(name.replace(underscoreRegex, " "))
		}

		this.live = info.isStream ?? true
		this.queueLine = this.live
			? `**${this.title}** (${this.lang.GLOBAL.HEADER_LIVE})`
			: `**${this.title}** (${sharedUtils.prettySeconds(this.lengthSeconds)})`

		this.noPauseReason = this.live ? this.lang.GLOBAL.CANNOT_PAUSE_LIVE : this.noPauseReason
	}

	public showLink(): Promise<string> {
		return this.uri ? Promise.resolve(this.uri) : super.showLink()
	}
}

export class RadioTrack extends RequiresSearchTrack {
	public thumbnail = { src: confprovider.config.local_placeholder, width: 512, height: 512 }
	public stationData: UnpackRecord<InferMap<typeof radioStations>["value"]>

	public constructor(
		station: string,
		requester: APIUser,
		lang: Lang
	) {
		const [namespace, substation] = station.split("/")
		const stationData = radioStations.get(namespace)?.[substation]
		if (!stationData) throw new Error("Invalid radio station")

		const info = {
			sourceName: "http",
			identifier: stationData.url,
			length: 0,
			isStream: true,
			position: 0,
			title: stationData.url,
			uri: stationData.url,
			isSeekable: false,
			author: stationData.author
		} as TrackInfo

		super("!", info, station, requester, lang)

		this.title = stationData.title
		this.author = stationData.author
		this.stationData = stationData
		this.queueLine = `**${this.stationData.title}** (${this.lang.GLOBAL.HEADER_LIVE})`
		this.noPauseReason = this.live ? this.lang.GLOBAL.CANNOT_PAUSE_LIVE : this.noPauseReason
		this.searchString = stationData.url
	}

	public showLink(): Promise<string> {
		return Promise.resolve(this.stationData.viewURL)
	}

	public async showInfo(): Promise<string> {
		return `Try finding more radio stations like this one on ${await this.showLink()}`
	}

	public getLyrics(): Promise<string | null> {
		return Promise.resolve(this.stationData.lyrics ?? null)
	}

	public static randomFromGenre(genre: string, requester: APIUser, lang: Lang): RadioTrack | null {
		const fromGenre = radioStationGenres.get(genre)
		if (!fromGenre?.length) return null

		return new RadioTrack(sharedUtils.arrayRandom(fromGenre), requester, lang)
	}

	public static random(requester: import("discord-api-types/v10").APIUser, lang: Lang): RadioTrack | null {
		const keys = Array.from(radioStationGenres.keys())
		const genre = sharedUtils.arrayRandom(keys)

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
