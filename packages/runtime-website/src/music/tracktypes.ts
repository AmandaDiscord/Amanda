import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")
import { Rest } from "lavacord"

import passthrough = require("../passthrough")
const { sync, confprovider, lavalink } = passthrough

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
	public readonly thumbnail = { src: confprovider.config.unknown_placeholder, width: 128, height: 128 }
	public queue: Queue | undefined
	public source: string
	public uri: string | null
	public isrc: string | null
	public complete = true
	public lyricsCache: string | null | undefined = undefined

	private _filledBarOffset = 0

	public constructor(
		public track: string,
		info: Partial<TrackInfo>,
		public input: string,
		public readonly requester: APIUser,
		public readonly lang: Lang
	) {
		this.title = info.title ?? lang.GLOBAL.UNKNOWN_TRACK
		this.author = info.author ?? lang.GLOBAL.UNKNOWN_AUTHOR
		this.lengthSeconds = Math.round(Number(info.length ?? 0) / 1000)
		this.id = info.identifier ?? "!"
		this.live = info.isStream ?? false
		this.source = info.sourceName ?? lang.GLOBAL.HEADER_UNKNOWN
		this.uri = info.uri ?? null
		this.isrc = info.isrc ?? null
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
			track: this.track,
			id: this.id,
			title: this.title,
			length: this.lengthSeconds,
			thumbnail: this.thumbnail,
			live: this.live,
			uri: this.uri,
			source: this.source,
			author: this.author,
			isrc: this.isrc,
			input: this.input,
			complete: this.complete
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
		if (typeof this.lyricsCache === "string" || this.lyricsCache === null) return this.lyricsCache
		const picked = common.genius.pickApart(this)
		if (!picked.artist || !picked.title) return this.assignLyrics(null)
		let lyrics: string | null

		try {
			lyrics = await common.genius.getLyrics(picked.title, picked.artist)
			if (!lyrics && picked.artist && picked.confidence === 1) lyrics = await common.genius.getLyrics(picked.artist, picked.title)
		} catch {
			lyrics = null
		}

		return this.assignLyrics(lyrics)
	}

	public assignLyrics(lyrics: string | null): string | null {
		this.lyricsCache = lyrics
		return lyrics
	}
}

export class RequiresSearchTrack extends Track {
	public prepareCache: sharedUtils.AsyncValueCache<void>
	public searchString: string

	public complete = false

	public constructor(
		track: string | null = null,
		info: Partial<TrackInfo>,
		input: string,
		requester: APIUser,
		lang: Lang
	) {
		super(track ?? "!", info, input, requester, lang)
		this.searchString = info.uri ?? info.identifier ?? ((info.author && info.title) ? `${info.author} - ${info.title}` : info.title ?? "")
		this.queueLine = `**${this.title}** (${sharedUtils.prettySeconds(this.lengthSeconds)})`

		this.prepareCache = new sharedUtils.AsyncValueCache(async () => {
			if (this.complete) return
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
				this.complete = true

				if (this.queue) this.queue.sendToSubscribedSessions("onTrackUpdate", this, this.queue.tracks.indexOf(this))
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
	public readonly thumbnail = { src: confprovider.config.local_placeholder, width: 512, height: 512 }

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
	public readonly thumbnail = { src: confprovider.config.local_placeholder, width: 512, height: 512 }
	public stationData: UnpackRecord<InferMap<typeof radioStations>["value"]>

	public constructor(
		track: string,
		_info: Partial<TrackInfo>,
		_input: string,
		requester: APIUser,
		lang: Lang,
		station?: string,
	) {
		if (station) _input = station

		const [namespace, substation] = _input.split("/")
		const stationData = radioStations.get(namespace)?.[substation]
		if (!stationData) throw new Error("Invalid radio station")

		const newInfo = {
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

		super(track, newInfo, _input, requester, lang)

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

		return new RadioTrack("!", {}, "", requester, lang, sharedUtils.arrayRandom(fromGenre))
	}

	public static random(requester: import("discord-api-types/v10").APIUser, lang: Lang): RadioTrack | null {
		const keys = Array.from(radioStationGenres.keys())
		const genre = sharedUtils.arrayRandom(keys)

		return RadioTrack.randomFromGenre(genre, requester, lang)!
	}
}

export class SecondTrack extends RequiresSearchTrack {
	private completeData: SecondVideo | null = null
	private secondDataPrepareCache: sharedUtils.AsyncValueCache<void>

	public constructor(
		track: string,
		info: Partial<TrackInfo>,
		input: string,
		requester: APIUser,
		lang: Lang,
		secondData?: SecondVideo | SecondPartialVideo
	) {
		super(track, info, input, requester, lang)

		if (secondData) {
			if ("adaptiveFormats" in secondData) this.processSecondData(secondData)
		}

		this.secondDataPrepareCache = new sharedUtils.AsyncValueCache(async () => {
			if (this.completeData || this.complete) return
			const node = (this.queue?.node ? common.nodes.byID(this.queue.node) : void 0) ?? common.nodes.byIdeal() ?? common.nodes.random()
			let data: Awaited<ReturnType<typeof common.second.byID>>
			try {
				data = await common.second.byID(this.id, node.invidious_origin)
			} catch (e) {
				this.error = e.message
				return
			}
			this.processSecondData(data)
		})
	}

	private processSecondData(data: SecondVideo) {
		const audioOnly = data.adaptiveFormats
			.filter(f => f.second__mime.startsWith("audio/"))
		const selected = audioOnly.find(f => f.qualityLabel === "medium" || f.qualityLabel === "medium, DRC")
			?? audioOnly.find(f => f.qualityLabel === "low" || f.qualityLabel === "low, DRC")
			?? data.adaptiveFormats[0]

		this.searchString = selected.url
		this.completeData = data
	}

	public async prepare(): Promise<void> {
		if (this.completeData || this.complete) return super.prepare()
		await this.secondDataPrepareCache.get()
		super.prepare()
	}

	public async getLyrics(): Promise<string | null> {
		if (typeof this.lyricsCache === "string" || this.lyricsCache === null) return this.lyricsCache

		const preferred = this.completeData?.captions.find(c => c.languageCode === (this.queue?.lang.CODE ?? this.lang.CODE))?.second__remoteUrl ?? null // prefer the queue's lang
		const english = this.completeData?.captions.find(c => c.languageCode === "en")?.second__remoteUrl ?? null
		const chosen = preferred ?? english

		if (chosen) {
			const remote = await fetch(chosen).then(r => r.text())
			if (!remote.startsWith("WEBVTT")) {
				console.error(remote)
				return super.getLyrics()
			}
			const split = remote.split("\n")
			const sliced = split.slice(4)
			let result = ""
			for (let i = 0; i < sliced.length / 3; i++) {
				result += sliced[(i * 3) + 1] + "\n"
			}
			return this.assignLyrics(result)
		} else return super.getLyrics()
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

export type SecondVideo = {
	type: "video"
	title: string
	videoId: string
	videoThumbnails: Array<SecondVideoThumbnail>
	storyboards: null
	description: string
	descriptionHtml: string
	published: number
	publishedText: null
	keywords: null
	viewCount: number
	second__viewCountText: string
	second__viewCountTextShort: string
	likeCount: number
	dislikeCount: number
	paid: null
	premium: null
	isFamilyFriendly: null
	allowedRegions: Array<unknown>
	genre: null
	genreUrl: null
	author: string
	authorId: string
	authorUrl: string
	second__uploaderId: string
	second__uploaderUrl: string
	authorThumbnails: Array<unknown>
	subCountText: null
	lengthSeconds: number
	allowRatings: boolean
	rating: null
	isListed: null
	liveNow: boolean
	isUpcoming: null
	dashUrl: string
	second__provideDashURL: null
	adaptiveFormats: Array<SecondVideoFormat>
	formatStreams: Array<SecondVideoFormat>
	captions: Array<SecondVideoCaption>
	recommendedVideos: Array<SecondPartialVideo>
}

export type SecondVideoThumbnail = {
	quality: "maxres" | "maxresdefault" | "sddefault" | "high" | "medium" | "default" | "start" | "middle" | "end"
	url: string
	second__originalUrl: string
	width: number
	height: number
}

export type SecondVideoFormat = {
	index: string | null
	bitrate: string
	init: string | null
	url: string
	itag: string
	type: string
	second__mime: string
	second__codecs: Array<string>
	clen: string
	lmt: null
	projectionType: null
	fps: null
	container: string
	encoding: null
	resolution: SecondVideoFormatResolution
	qualityLabel: SecondVideoFormatResolution
	second__width: number | null
	second__height: number | null
	second__audioChannels: number | null
	second__order: number
}

export type SecondVideoFormatResolution =
	"low" | "low, DRC" | "medium" | "medium, DRC" | "128p" | "144p" | "214p" | "320p" | "360p" | "428p" | "640p" | "720p" | "960p" | "1280p" | "1920p"

export type SecondVideoCaption = {
	label: string
	languageCode: string
	url: string
	second__remoteUrl: string
}

export type SecondPartialVideo = Pick<SecondVideo, "videoId" | "title" | "videoThumbnails" | "author" | "authorUrl" | "authorId" | "lengthSeconds" | "viewCount"> & {
	second__lengthText: string
	viewCountText: string
	second__liveNow: boolean
}

export type SecondSearchResult = Array<SecondPartialVideo>
