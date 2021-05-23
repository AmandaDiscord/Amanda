// @ts-check

const Discord = require("thunderstorm")
const c = require("centra")
const entities = require("entities")

const passthrough = require("../../passthrough")
const { constants, reloader, frisky, config, ipc } = passthrough

const utils = require("../../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

const common = require("./common.js")
reloader.sync("./commands/music/common.js", common)

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

class Song {
	constructor() {
		this.title = ""
		this.track = ""
		this.lengthSeconds = -1
		this.queueLine = ""
		this.npUpdateFrequency = 0
		this.noPauseReason = ""
		this.error = ""
		this.typeWhileGetRelated = true
		/** only used for error logs at the moment (???) */
		this.id = ""
		this.live = null
		this.thumbnail = {
			src: "",
			width: 0,
			height: 0
		}
		/**
		 * might not be set!
		 * @type {import("./queue").Queue}
		 */
		this.queue = null

		this.validated = false
		setTimeout(() => {
			if (this.validated == false) this.validationError("must call validate() in constructor")
		})
	}
	/**
	 * @returns {any}
	 */
	toObject() {
		return {
			class: "Did not override generic toObject"
		}
	}
	getState() {
		const object = this.toObject()
		return {
			title: this.title,
			length: this.lengthSeconds,
			thumbnail: this.thumbnail,
			live: this.live,
			class: object.class,
			id: object.id
		}
	}
	/**
	 * @param {number} time milliseconds
	 * @param {boolean} paused
	 */
	// @ts-ignore
	getProgress(time, paused) {
		return ""
	}
	/**
	 * An array of Song objects from related songs
	 * @returns {Promise<Song[]>}
	 */
	getRelated() {
		return Promise.resolve([])
	}
	/**
	 * Sendable data showing the related songs
	 * @returns {Promise<string|Discord.MessageEmbed>}
	 */
	showRelated() {
		return Promise.resolve("This isn't a real song.")
	}
	showLink() {
		return Promise.resolve(constants.baseURL)
	}
	/**
	 * Get sendable data with information about this song
	 * @returns {Promise<string|Discord.MessageEmbed>}
	 */
	showInfo() {
		return Promise.resolve("This isn't a real song.")
	}
	/**
	 * @returns {Promise<string>}
	 */
	async getLyrics() {
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
	/**
	 * @param {string} message
	 */
	validationError(message) {
		console.error(`Song validation error: ${this.constructor.name} ${message}`)
	}
	validate() {
		["id", "track", "title", "queueLine", "npUpdateFrequency"].forEach(key => {
			if (!this[key]) this.validationError(`unset ${key}`)
		})
		;["getProgress", "getRelated", "showRelated", "showInfo", "toObject"].forEach(key => {
			if (this[key] === Song.prototype[key]) this.validationError(`unset ${key}`)
		})
		if (typeof (this.lengthSeconds) != "number" || this.lengthSeconds < 0) this.validationError("unset lengthSeconds")
		if (!this.thumbnail.src) this.validationError("unset thumbnail src")
		if (this.live === null) this.validationError("unset live")
		this.validated = true
	}
	/**
	 * Code to run to prepare the song for playback, such as fetching its `track`.
	 */
	prepare() {
		return Promise.resolve()
	}
	/**
	 * Code to run after the song was regenerated from resuming a queue
	 */
	resume() {
		return Promise.resolve()
	}
	/**
	 * Clean up event listeners and such when the song is removed
	 */
	destroy() {
		return undefined
	}
}

class YouTubeSong extends Song {
	/**
	 * @param {string} id
	 * @param {string} title
	 * @param {number} lengthSeconds
	 * @param {string} [track]
	 * @param {string} [uploader]
	 */
	constructor(id, title, lengthSeconds, track = null, uploader = undefined) {
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
		/** @type {string} */ // the vscode type checker is dumb, it would seem
		this.track = track || "!"
		this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
		this.npUpdateFrequency = 5000
		this.typeWhileGetRelated = true
		this.live = false

		this.related = new utils.AsyncValueCache(
			() => {
				return c(`${this.getInvidiousOrigin()}/api/v1/videos/${this.id}`).send().then(async data => {
					const json = await data.json()
					this.typeWhileGetRelated = false
					return json.recommendedVideos.filter(v => v.lengthSeconds > 0).slice(0, 10)
				})
			})

		// eslint-disable-next-line require-await
		this.prepareCache = new utils.AsyncValueCache(async () => {
			if (this.track == "!") {
				return common.searchYouTube(this.id, this.queue.voiceChannel.rtcRegion).then(tracks => {
					if (!tracks[0]) this.error = `No results for ID ${this.id}`
					else if (tracks[0] && !tracks[0].track) this.error = `Missing track for ID ${this.id}`
					else {
						this.track = tracks[0].track
						if (tracks[0].info) this.uploader = tracks[0].info.author
					}
				}).catch(message => {
					this.error = message
				})
			}
		})

		this.validate()
	}
	toObject() {
		return {
			class: "YouTubeSong",
			id: this.id,
			title: this.title,
			lengthSeconds: this.lengthSeconds,
			track: this.track,
			uploader: this.uploader
		}
	}
	/**
	 * @param {number} time milliseconds
	 * @param {boolean} paused
	 */
	getProgress(time, paused) {
		const max = this.lengthSeconds
		const rightTime = common.prettySeconds(max)
		if (time > max) time = max
		const leftTime = common.prettySeconds(time)
		const bar = utils.progressBar(18, time, max, paused ? " [PAUSED] " : "")
		return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
	}
	async getRelated() {
		const related = await this.related.get().catch(() => [])
		return related.map(v => new YouTubeSong(v.videoId, v.title, v.lengthSeconds))
	}
	showRelated() {
		return this.related.get().then(related => {
			if (related.length) {
				return new Discord.MessageEmbed()
					.setTitle("Related content from YouTube")
					.setDescription(
						related.map((v, i) =>
							`${i + 1}. **${Discord.Util.escapeMarkdown(v.title)}** (${common.prettySeconds(v.lengthSeconds)})`
						+ `\n — ${v.author}`
						)
					)
					.setFooter("Play one of these? &music related play <number>, or &m rel p <number>")
					.setColor(constants.standard_embed_color)
			} else {
				return "No related content available for the current song."
			}
		}).catch(() => {
			this.typeWhileGetRelated = false
			return `Invidious didn't return valid data.\
				\n<${this.getInvidiousOrigin()}/api/v1/videos/${this.id}>\
				\n<${this.getInvidiousOrigin()}/v/${this.id}>\
				\n<https://youtu.be/${this.id}>`
		})
	}
	getInvidiousOrigin() {
		return common.nodes.getByID(this.queue.nodeID).invidious_origin
	}
	showLink() {
		return this.showInfo()
	}
	showInfo() {
		return Promise.resolve(`https://www.youtube.com/watch?v=${this.id}`)
	}
	prepare() {
		return this.prepareCache.get()
	}
	resume() {
		return Promise.resolve()
	}
	destroy() {
		return undefined
	}
}

class FriskySong extends Song {
	/**
	 * @param {string} station
	 * @param {any} [data]
	 */
	constructor(station, data = {}) {
		super()

		this.station = station

		if (!stationData.has(this.station)) throw new Error(`Unsupported station: ${this.station}`)
		this.stationData = stationData.get(this.station)

		this.id = `frisky/${this.station}` // designed for error reporting
		this.thumbnail = {
			src: constants.frisky_placeholder,
			width: 320,
			height: 180
		}
		this.title = this.stationData.title
		this.queueLine = `**${this.stationData.queue}** (LIVE)`
		this.track = data.track || "!"
		this.lengthSeconds = 0
		this.npUpdateFrequency = 15000
		this.typeWhileGetRelated = false
		this.noPauseReason = "You can't pause live radio."
		this.live = true

		this.friskyStation = frisky.managers.stream.stations.get(this.stationData.client_name)
		this.stationInfoGetter = new utils.AsyncValueCache(
			/**
			 * @returns {Promise<import("frisky-client/lib/Stream")>}
			 */
			() => new Promise((resolve, reject) => {
				let attempts = 0

				const attempt = () => {
					const retry = (reason) => {
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
					// console.log("Retrieved Frisky station data in "+(Date.now()-time)+"ms")
					return resolve(stream)
				}
				attempt()
			})
		)

		this._filledBarOffset = 0

		this.validate()
	}
	toObject() {
		return {
			class: "FriskySong",
			station: this.station,
			track: this.track
		}
	}
	getRelated() {
		return Promise.resolve([])
	}
	showRelated() {
		return Promise.resolve("Try the other stations on Frisky Radio! `&frisky`, `&frisky deep`, `&frisky chill`")
	}
	showLink() {
		return this.stationInfoGetter.get().then(stream => {
			return `https://beta.frisky.fm/mix/${stream.mix.id}`
		}).catch(() => "https://beta.frisy.fm")
	}
	showInfo() {
		return this.stationInfoGetter.get().then(stream => {
			const mix = stream.mix
			const stationCase = this.station[0].toUpperCase() + this.station.slice(1).toLowerCase()
			let percentPassed = Math.floor(((-stream.getTimeUntil()) / (stream.data.duration * 1000)) * 100)
			if (percentPassed < 0) percentPassed = 0
			if (percentPassed > 100) percentPassed = 100
			const embed = new Discord.MessageEmbed()
				.setColor(constants.standard_embed_color)
				.setTitle(`FRISKY: ${mix.data.title}`)
				.setURL(`https://beta.frisky.fm/mix/${mix.id}`)
				.addFields({
					name: "Details",
					value: utils.tableifyRows(
						[
							["Episode", `${mix.data.title} / [view](https://beta.frisky.fm/mix/${mix.id})`],
							["Show", `${mix.data.title.split(" - ")[0]} / [view](https://beta.frisky.fm/shows/${mix.data.show_id.id})`],
							["Genre", mix.data.genre.join(", ")],
							["Station", stationCase],
							["Schedule", `started ${utils.shortTime(-stream.getTimeUntil(), "ms", ["d", "h", "m"])} ago, ${utils.shortTime(stream.getTimeUntil() + stream.data.duration * 1000, "ms", ["d", "h", "m"])} remaining (${percentPassed}%)`]
						],
						["left", ""],
						() => "`"
					)
				})
			if (mix.episode) {
				embed.setThumbnail(this.thumbnail.src)
			}
			if (mix.data.track_list && mix.data.track_list.length) {
				let trackList = mix.data.track_list
					.slice(0, 6)
					.map(track => `${track.artist} - ${track.title}`)
					.join("\n")
				const hidden = mix.data.track_list.length - 6
				if (hidden > 0) trackList += `\n_and ${hidden} more..._`
				embed.addFields({ name: "Track list", value: trackList })
			}
			return embed
		}).catch(reason => {
			console.error(reason)
			return "Unfortunately, we failed to retrieve information about the current song."
		})
	}
	/**
	 * @param {number} time
	 */
	getProgress(time) {
		const part = "= ⋄ ==== ⋄ ==="
		const fragment = part.substr(7 - this._filledBarOffset, 7)
		const bar = `${fragment.repeat(3)}` // SC: ZWSP x 2
		this._filledBarOffset++
		if (this._filledBarOffset >= 7) this._filledBarOffset = 0
		// eslint-disable-next-line no-irregular-whitespace
		return `\`[ ${common.prettySeconds(time)} ​${bar}​ LIVE ]\`` // SC: ZWSP x 2
	}
	async prepare() {
		if (!this.bound) {
			this.bound = this.stationUpdate.bind(this)
			this.friskyStation.events.addListener("changed", this.bound)
			await this.stationUpdate()
		}
		if (this.track == "!") {
			let mp3URL = this.stationData.beta_url
			if (this.station === "chill") mp3URL = this.stationData.url
			return common.getTracks(mp3URL, this.queue.voiceChannel.rtcRegion).then(tracks => {
				if (tracks[0] && tracks[0].track) this.track = tracks[0].track
				else {
					console.error(tracks)
					this.error = `No tracks available for station ${this.station}`
				}
			}).catch(message => {
				this.error = message
			})
		} else return Promise.resolve()
	}
	stationUpdate() {
		this.stationInfoGetter.clear()
		return this.stationInfoGetter.get().then(stream => {
			const mix = stream.mix
			// console.log(mix)
			this.title = mix.data.title
			this.thumbnail.src = mix.episode.data.album_art.url
			this.thumbnail.width = mix.episode.data.album_art.image_width
			this.thumbnail.height = mix.episode.data.album_art.image_height
			if (this.queue) {
				const index = this.queue.songs.indexOf(this)
				if (index !== -1) ipc.replier.sendSongUpdate(this.queue, this, index)
			}
		}).catch(reason => {
			console.error(reason)
		})
	}
	resume() {
		return this.prepare()
	}
	destroy() {
		if (this.bound) this.friskyStation.events.removeListener("changed", this.bound)
	}
}

class SoundCloudSong extends Song {
	/**
	 * @param {import("../../typings").LavalinkInfo} data
	 * @param {string} track
	 */
	constructor(data, track) {
		super()
		this.title = data.title
		this.track = track
		this.artist = data.author
		this.lengthSeconds = Math.floor(data.length / 1000)
		this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
		this.npUpdateFrequency = 5000
		this.error = ""
		this.typeWhileGetRelated = false
		this.trackNumber = data.identifier.match(/soundcloud:tracks:(\d+)/)[1]
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

	/**
	 * @param {number} time milliseconds
	 * @param {boolean} paused
	 */
	getProgress(time, paused) {
		const max = this.lengthSeconds
		const rightTime = common.prettySeconds(max)
		if (time > max) time = max
		const leftTime = common.prettySeconds(time)
		const bar = utils.progressBar(18, time, max, paused ? " [PAUSED] " : "")
		return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
	}

	getRelated() {
		return Promise.resolve([])
	}

	showRelated() {
		return Promise.resolve("Try finding related songs on SoundCloud.")
	}

	showLink() {
		return this.showInfo()
	}

	showInfo() {
		return Promise.resolve(this.uri)
	}

	toObject() {
		return {
			class: "SoundCloudSong",
			id: this.id,
			trackNumber: this.trackNumber,
			title: this.title,
			lengthSeconds: this.lengthSeconds,
			track: this.track,
			uri: this.uri,
			live: this.live
		}
	}

	getState() {
		return Object.assign(super.getState(), { trackNumber: this.trackNumber })
	}
}

// @ts-ignore
class SpotifySong extends YouTubeSong {
	/**
	 * @param {import("../../typings").SpotifyTrack & { track?: string, youtubeID?: string }} data
	 */
	constructor(data) {
		super(data.youtubeID || "!", data.name, Math.floor(data.duration_ms / 1000))
		this.trackNumber = data.track_number
		this.live = false
		this.thumbnail = data.album && data.album.images[0] ? { src: data.album.images[0].url, width: data.album.images[0].width, height: data.album.images[0].height } : { src: constants.spotify_placeholder, width: 386, height: 386 }
		this.uri = data.uri
		this.typeWhileGetRelated = false
		this.related = []
		this.artist = data.artists[0].name
		// eslint-disable-next-line require-await
		this.prepareCache = new utils.AsyncValueCache(async () => {
			if (this.id == "!" || this.track == "!") {
				return common.searchYouTube(`${this.artist} - ${this.title}`, this.queue.voiceChannel.rtcRegion).then(tracks => {
					if (!tracks[0]) this.error = `No results for ${this.title}`
					let decided = tracks[0]
					const found = tracks.find(item => item.info && item.info.author.includes("- Topic"))
					if (found) decided = found
					if (decided && decided.track) {
						this.id = decided.info.identifier
						this.lengthSeconds = Math.round(decided.info.length / 1000)
						this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
						this.track = decided.track
						ipc.replier.sendSongUpdate(this.queue, this, this.queue.songs.indexOf(this))
					} else this.error = `Missing track for ${this.title}`
				}).catch(message => {
					this.error = message
				})
			}
		})

		this.validate()
	}
	toObject() {
		return {
			class: "SpotifySong",
			trackNumber: this.trackNumber,
			durationMS: this.lengthSeconds * 1000,
			lengthSeconds: this.lengthSeconds,
			uploader: this.artist,
			title: this.title,
			uri: this.uri,
			artist: this.artist,
			id: this.id,
			track: this.track
		}
	}
	getRelated() {
		return Promise.resolve([])
	}
	showRelated() {
		return Promise.resolve("Try finding related songs on Spotify.")
	}
	showLink() {
		const ID = this.uri.match(/spotify:track:([\d\w]+)/)[1]
		return Promise.resolve(`https://open.spotify.com/track/${ID}`)
	}
	async showInfo() {
		const SP = await this.showLink()
		const YT = await super.showInfo()
		return Promise.resolve(`${SP}\n${YT}`)
	}
	prepare() {
		return this.prepareCache.get()
	}
}

class ExternalSong extends Song {
	/**
	 * @param {string} link
	 */
	constructor(link) {
		super()
		const to = new URL(link)
		let name
		const pathnamereg = /\/?(\w+)\.\w+/
		if (!to.pathname.match(pathnamereg)) name = "Unknown Track"
		else name = to.pathname.match(pathnamereg)[1]
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
		this.typeWhileGetRelated = false
		this.noPauseReason = "You can't pause external audio."
		this.id = String(Date.now())
		this._filledBarOffset = 0

		this.validate()
	}
	async prepare() {
		let info
		try {
			info = await common.getTracks(this.uri, this.queue.voiceChannel.rtcRegion)
		} catch {
			this.error = `Missing track for ${this.title}`
			return
		}
		if (!Array.isArray(info) || !info || !info[0] || !info[0].track) this.error = `Missing track for ${this.title}`
		this.track = info[0].track
		if (info[0].info.isSeekable) {
			this.live = false
			this.lengthSeconds = Math.round(info[0].info.length / 1000)
			this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
			this.noPauseReason = undefined
			ipc.replier.sendSongUpdate(this.queue, this, this.queue.songs.indexOf(this))
		}
	}
	toObject() {
		return {
			title: this.title,
			class: "ExternalSong",
			lengthSeconds: this.lengthSeconds,
			uri: this.uri,
			id: this.id,
			track: this.track
		}
	}
	getRelated() {
		return Promise.resolve([])
	}
	showRelated() {
		return Promise.resolve("Try finding related songs on other websites")
	}
	showLink() {
		return Promise.resolve(this.uri)
	}
	showInfo() {
		return this.showLink()
	}
	/**
	 * @param {number} time
	 * @param {boolean} paused
	 */
	getProgress(time, paused) {
		let bar
		const leftTime = common.prettySeconds(time)
		const rightTime = this.live ? "LIVE" : common.prettySeconds(this.lengthSeconds)
		if (this.live) {
			const part = "= ⋄ ==== ⋄ ==="
			const fragment = part.substr(7 - this._filledBarOffset, 7)
			bar = `${fragment.repeat(3)}` // SC: ZWSP x 2
			this._filledBarOffset++
			if (this._filledBarOffset >= 7) this._filledBarOffset = 0
		} else {
			if (time > this.lengthSeconds) time = this.lengthSeconds
			bar = utils.progressBar(18, time, this.lengthSeconds, paused ? " [PAUSED] " : "")
		}
		return `\`[ ${leftTime} ​${bar}​ ${rightTime} ]\`` // SC: ZWSP x 2
	}
	resume() {
		return this.prepare()
	}
}

class ListenMoeSong extends Song {
	/**
	 * @param {"jp" | "kp"} station
	 */
	constructor(station) {
		super()

		this.station = station
		this.stationData = passthrough.listenMoe[station]
		this.live = true
		this.lengthSeconds = this.stationData.nowPlaying.duration
		this.id = this._id
		this.title = this.stationData.nowPlaying.title
		this.queueLine = `**${this.title}** (${this.lengthSeconds ? common.prettySeconds(this.lengthSeconds) : "LIVE"})`
		this.thumbnail = {
			src: constants.listen_moe_placeholder,
			width: 64,
			height: 64
		}
		this.uri = this.stationData.Constants.STREAM_URLS[station === "jp" ? "JPOP" : "KPOP"].vorbis
		this.track = "!"
		this.npUpdateFrequency = 15000
		this.typeWhileGetRelated = false
		this.noPauseReason = "You can't pause live audio."
		this._filledBarOffset = 0

		this.validate()
	}
	get _id() {
		return String((this.stationData.nowPlaying.albums && this.stationData.nowPlaying.albums[0] ? (this.stationData.nowPlaying.albums[0].id || this.stationData.nowPlaying.id) : this.stationData.nowPlaying.id))
	}
	async prepare() {
		if (!this.bound) {
			this.bound = this.stationUpdate.bind(this)
			this.stationData.on("trackUpdate", this.bound)
		}
		if (this.track === "!") {
			let info
			try {
				info = await common.getTracks(this.uri, this.queue.voiceChannel.rtcRegion)
			} catch {
				this.error = `Missing track for ${this.title}`
				return
			}
			if (!Array.isArray(info) || !info || !info[0] || !info[0].track) this.error = `Missing track for ${this.title}`
			this.track = info[0].track
		} else return Promise.resolve()
	}
	toObject() {
		return {
			class: "ListenMoeSong",
			station: this.station,
			lengthSeconds: this.lengthSeconds,
			uri: this.uri,
			id: this.id,
			track: this.track
		}
	}
	getRelated() {
		return Promise.resolve([])
	}
	showRelated() {
		return Promise.resolve("Try the other stations on <https://listen.moe>")
	}
	showLink() {
		return Promise.resolve(`https://listen.moe/albums/${this.id}`)
	}
	async showInfo() {
		const link = await this.showLink()
		return `https://listen.moe\n${link}`
	}
	/**
	 * @param {number} fallback
	 */
	getProgress(fallback) {
		let time
		if (this.stationData.lastTrackStartedAt) time = Math.floor((Date.now() - this.stationData.lastTrackStartedAt) / 1000)
		else time = fallback
		const part = "= ⋄ ==== ⋄ ==="
		const fragment = part.substr(7 - this._filledBarOffset, 7)
		let bar
		if (!this.lengthSeconds) bar = `${fragment.repeat(3)}` // SC: ZWSP x 2
		else {
			if (time > this.lengthSeconds) time = this.lengthSeconds
			bar = utils.progressBar(18, time, this.lengthSeconds)
		}
		this._filledBarOffset++
		if (this._filledBarOffset >= 7) this._filledBarOffset = 0
		return `\`[ ${common.prettySeconds(time)} ​${bar}​ ${this.lengthSeconds ? common.prettySeconds(this.lengthSeconds) : "LIVE"} ]\`` // SC: ZWSP x 2
	}
	resume() {
		return this.prepare()
	}
	destroy() {
		if (this.bound) this.stationData.removeListener("trackUpdate", this.bound)
	}
	/**
	 * @param {import("listensomemoe/dist/Types").Track} track
	 */
	stationUpdate(track) {
		this.title = track.title
		this.lengthSeconds = track.duration
		this.id = this._id
		this.queueLine = `**${this.title}** (${this.lengthSeconds ? common.prettySeconds(this.lengthSeconds) : "LIVE"})`
		ipc.replier.sendSongUpdate(this.queue, this, this.queue.songs.indexOf(this))
	}
}

class NewgroundsSong extends Song {
	/**
	 * @param {{ href: string, author: string, title: string, id: number, mp3URL: string, duration: number, track?: string }} data
	 */
	constructor(data) {
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
		this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
		this.npUpdateFrequency = 5000
		this.error = ""
		this.typeWhileGetRelated = false

		this.validate()
	}
	toObject() {
		return {
			class: "NewgroundsSong",
			href: this.uri,
			title: this.title,
			author: this.author,
			id: this.id,
			mp3URL: this.streamURL,
			duration: this.lengthSeconds,
			track: this.track
		}
	}
	getRelated() {
		return Promise.resolve([])
	}
	showRelated() {
		return Promise.resolve("Try finding related songs on NewGrounds")
	}
	async prepare() {
		if (this.track && this.track != "!") return
		let data
		try {
			data = await common.getTracks(this.streamURL, this.queue.voiceChannel.rtcRegion)
		} catch {
			this.error = `Missing track for ${this.title}`
			return
		}
		if (!Array.isArray(data) || !data || !data[0] || !data[0].track) this.error = `Missing track for ${this.title}`
		this.track = data[0].track
	}
	showLink() {
		return Promise.resolve(this.uri)
	}
	showInfo() {
		return this.showLink()
	}
	/**
	 * @param {number} time milliseconds
	 * @param {boolean} paused
	 */
	getProgress(time, paused) {
		const max = this.lengthSeconds
		const rightTime = common.prettySeconds(max)
		if (time > max) time = max
		const leftTime = common.prettySeconds(time)
		const bar = utils.progressBar(18, time, max, paused ? " [PAUSED] " : "")
		return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
	}
}

// Just for name parity
class TwitterSong extends Song {
	/**
	 * @param {{ title: string, uri: string, displayURI: string }} data
	 */
	constructor(data) {
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
		this.typeWhileGetRelated = false

		this.validate()
	}
	toObject() {
		return {
			class: "TwitterSong",
			uri: this.uri,
			displayURI: this.displayURI,
			title: this.title,
			id: this.id,
			lengthSeconds: this.lengthSeconds,
			track: this.track
		}
	}
	getRelated() {
		return Promise.resolve([])
	}
	showRelated() {
		return Promise.resolve("Try finding related Tweets on Twitter")
	}
	async prepare() {
		if (this.track && this.track != "!") return
		let data
		try {
			data = await common.getTracks(this.uri, this.queue.voiceChannel.rtcRegion)
		} catch {
			this.error = `Missing track for ${this.title}`
			return
		}
		if (!Array.isArray(data) || !data || !data[0] || !data[0].track) this.error = `Missing track for ${this.title}`
		this.track = data[0].track
		this.lengthSeconds = Math.round(data[0].info.length / 1000)
		this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
		ipc.replier.sendSongUpdate(this.queue, this, this.queue.songs.indexOf(this))
	}
	showLink() {
		return Promise.resolve(this.displayURI)
	}
	showInfo() {
		return this.showLink()
	}
	/**
	 * @param {number} time milliseconds
	 * @param {boolean} paused
	 */
	getProgress(time, paused) {
		const max = this.lengthSeconds
		const rightTime = common.prettySeconds(max)
		if (time > max) time = max
		const leftTime = common.prettySeconds(time)
		const bar = utils.progressBar(18, time, max, paused ? " [PAUSED] " : "")
		return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
	}
}

// @ts-ignore
class iTunesSong extends YouTubeSong {
	/**
	 * @param {import("../../typings").iTunesSearchResult} data
	 */
	constructor(data) {
		super("!", data.trackName, Math.floor(data.trackTimeMillis / 1000))

		this.live = false
		this.id = `appl/${data.trackId}`
		this.ytID = "!"
		this.related = []
		this.artist = data.artistName
		this.trackViewURL = data.trackViewUrl

		this.thumbnail = {
			src: data.artworkUrl100,
			width: 100,
			height: 100
		}
		this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
		this.npUpdateFrequency = 5000
		this.error = ""
		this.typeWhileGetRelated = false

		// eslint-disable-next-line require-await
		this.prepareCache = new utils.AsyncValueCache(async () => {
			if (this.ytID == "!" || this.track == "!") {
				return common.searchYouTube(`${this.artist} - ${this.title}`, this.queue.voiceChannel.rtcRegion).then(tracks => {
					if (!tracks[0]) this.error = `No results for ${this.title}`
					let decided = tracks[0]
					const found = tracks.find(item => item.info && item.info.author.includes("- Topic"))
					if (found) decided = found
					if (decided && decided.track) {
						this.ytID = decided.info.identifier
						this.lengthSeconds = Math.round(decided.info.length / 1000)
						this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
						this.track = decided.track
						ipc.replier.sendSongUpdate(this.queue, this, this.queue.songs.indexOf(this))
					} else this.error = `Missing track for ${this.title}`
				}).catch(message => {
					this.error = message
				})
			}
		})

		this.validate()
	}
	toObject() {
		return {
			class: "iTunesSong",
			trackName: this.title,
			trackTimeMillis: this.lengthSeconds * 1000,
			lengthSeconds: this.lengthSeconds,
			artistName: this.artist,
			title: this.title,
			trackViewURL: this.trackViewURL,
			trackId: this.id,
			track: this.track,
			artworkUrl100: this.thumbnail.src,
			id: this.id,
			uploader: this.artist
		}
	}
	getRelated() {
		return Promise.resolve([])
	}
	showRelated() {
		return Promise.resolve("Try finding related songs on iTunes.")
	}
	showLink() {
		return Promise.resolve(this.trackViewURL)
	}
	async showInfo() {
		const iT = await this.showLink()
		const YT = `https://www.youtube.com/watch?v=${this.ytID}`
		return Promise.resolve(`${iT}\n${YT}`)
	}
	prepare() {
		return this.prepareCache.get()
	}
}

/**
 * @param {{ track: string, info: { identifier: string, title: string, length: number, author: string } }} data
 */
function makeYouTubeSongFromData(data) {
	return new YouTubeSong(data.info.identifier, data.info.title, Math.round(data.info.length / 1000), data.track || null, data.info.author)
}

/**
 * @param {string} trackNumber
 * @param {string} title
 * @param {number} lengthSeconds
 * @param {boolean} live
 * @param {string} uri
 * @param {string} track
 */
function makeSoundCloudSong(trackNumber, title, lengthSeconds, live, uri, track) {
	// @ts-ignore
	return new SoundCloudSong({
		identifier: `soundcloud:tracks:${trackNumber}`,
		title: title,
		length: lengthSeconds * 1000,
		isStream: live,
		uri: uri
	}, track)
}

/**
 * @param {import("../../typings").SpotifyTrack} data
 * @param {string} [id]
 * @param {string} [track]
 */
function makeSpotifySong(data, id = undefined, track = undefined) {
	if (id) Object.assign(data, { youtubeID: id })
	if (track) Object.assign(data, { track: track })
	return new SpotifySong(data)
}

/**
 * @param {string} link
 */
function makeExternalSong(link) {
	return new ExternalSong(link)
}

/**
 * @param {"jp" | "kp"} station
 */
function makeListenMoeSong(station) {
	return new ListenMoeSong(station)
}

/**
	 * @param {{ href: string, author: string, title: string, id: number, mp3URL: string, duration: number, track?: string }} data
	 */
function makeNewgroundsSong(data) {
	return new NewgroundsSong(data)
}

/**
 * @param {{ title: string, uri: string, displayURI: string }} data
 */
function makeTwitterSong(data) {
	return new TwitterSong(data)
}

/**
 * @param {import("../../typings").iTunesSearchResult} data
 */
function makeiTunesSong(data) {
	return new iTunesSong(data)
}

module.exports.makeYouTubeSongFromData = makeYouTubeSongFromData
module.exports.Song = Song
module.exports.YouTubeSong = YouTubeSong
module.exports.FriskySong = FriskySong
module.exports.SoundCloudSong = SoundCloudSong
module.exports.makeSoundCloudSong = makeSoundCloudSong
module.exports.SpotifySong = SpotifySong
module.exports.makeSpotifySong = makeSpotifySong
module.exports.ExternalSong = ExternalSong
module.exports.makeExternalSong = makeExternalSong
module.exports.ListenMoeSong = ListenMoeSong
module.exports.makeListenMoeSong = makeListenMoeSong
module.exports.NewgroundsSong = NewgroundsSong
module.exports.makeNewgroundsSong = makeNewgroundsSong
module.exports.TwitterSong = TwitterSong
module.exports.makeTwitterSong = makeTwitterSong
module.exports.iTunesSong = iTunesSong
module.exports.makeiTunesSong = makeiTunesSong
