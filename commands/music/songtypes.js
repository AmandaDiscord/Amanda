//@ts-check

const Discord = require("discord.js")
const rp = require("request-promise")

const passthrough = require("../../passthrough")
let {client, reloader, frisky} = passthrough

let utils = require("../../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

let common = require("./common.js")
reloader.useSync("./commands/music/common.js", common)

const stationData = new Map([
	["frisky", {
		title: "Frisky Radio",
		queue: "Frisky Radio: Frisky",
		url: "http://stream.friskyradio.com/frisky_mp3_hi", // 44100Hz 2ch 128k MP3
		beta_url: "http://stream.friskyradio.com/frisky_mp3_hi" // 44100Hz 2ch 128k MP3
	}],
	["deep", {
		title: "Frisky Radio: Deep",
		queue: "Frisky Radio: Deep",
		url: "http://deep.friskyradio.com/friskydeep_acchi", // 32000Hz 2ch 128k MP3 (!)
		beta_url: "http://deep.friskyradio.com/friskydeep_aachi" // 32000Hz 2ch 128k MP3 (!)
	}],
	["chill", {
		title: "Frisky Radio: Chill",
		queue: "Frisky Radio: Chill",
		url: "http://chill.friskyradio.com/friskychill_mp3_high", // 44100Hz 2ch 128k MP3
		beta_url: "https://stream.chill.friskyradio.com/mp3_high" // 44100Hz 2ch 128k MP3
	}],
	["classics", {
		title: "Frisky Radio: Classics",
		queue: "Frisky Radio: Classics",
		url: "https://stream.classics.friskyradio.com/mp3_high", // 44100Hz 2ch 128k MP3
		beta_url: "https://stream.classics.friskyradio.com/mp3_high" // 44100Hz 2ch 128k MP3
	}]
])

class Song {
	constructor() {
		this.title = ""
		this.queueLine = ""
		this.track = ""
		this.lengthSeconds = -1
		this.npUpdateFrequency = 0
		this.noPauseReason = ""
		this.error = ""
		this.typeWhileGetRelated = true

		this.validated = false
		setTimeout(() => {
			if (this.validated == false) this.validationError("must call validate() in constructor")
		})
	}
	toObject() {
		return {
			class: "Did not override generic toObject"
		}
	}
	/**
	 * @param {number} time milliseconds
	 * @param {boolean} paused
	 */
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
	/**
	 * Get sendable data with information about this song
	 * @returns {Promise<string|Discord.MessageEmbed>}
	 */
	showInfo() {
		return Promise.resolve("This isn't a real song.")
	}
	/**
	 * @param {string} message
	 */
	validationError(message) {
		console.error("Song validation error: "+this.constructor.name+" "+message)
	}
	validate() {
		["track", "title", "queueLine", "npUpdateFrequency"].forEach(key => {
			if (!this[key]) this.validationError("unset "+key)
		})
		;["getProgress", "getRelated", "showRelated", "showInfo", "toObject", "destroy"].forEach(key => {
			if (this[key] === Song.prototype[key]) this.validationError("unset "+key)
		})
		if (typeof(this.lengthSeconds) != "number" || this.lengthSeconds < 0) this.validationError("unset lengthSeconds")
		this.validated = true
	}
	prepare() {
		return Promise.resolve()
	}
	destroy() {
	}
}

class YouTubeSong extends Song {
	/**
	 * @param {string} id
	 * @param {string} title
	 * @param {number} lengthSeconds
	 * @param {string?} track
	 */
	constructor(id, title, lengthSeconds, track = undefined) {
		super()
		this.id = id
		this.title = title
		this.lengthSeconds = lengthSeconds
		this.track = track || "!"
		this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
		this.npUpdateFrequency = 5000
		this.typeWhileGetRelated = true

		this.related = new utils.AsyncValueCache(
		/** @returns {Promise<any[]>} */
		() => {
			return rp(`https://invidio.us/api/v1/videos/${this.id}`, {json: true}).then(data => {
				this.typeWhileGetRelated = false
				return data.recommendedVideos.filter(v => v.lengthSeconds > 0).slice(0, 10)
			})
		})

		this.validate()
	}
	toObject() {
		return {
			class: "YouTubeSong",
			id: this.id,
			title: this.title,
			lengthSeconds: this.lengthSeconds,
			track: this.track
		}
	}
	/**
	 * @param {number} time milliseconds
	 * @param {boolean} paused
	 */
	getProgress(time, paused) {
		let max = this.lengthSeconds
		let rightTime = common.prettySeconds(max)
		if (time > max) time = max
		let leftTime = common.prettySeconds(time)
		let bar = utils.progressBar(35, time, max, paused ? " [PAUSED] " : "")
		return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
	}
	async getRelated() {
		let related = await this.related.get().catch(() => [])
		return related.map(v => new YouTubeSong(v.videoId, v.title, v.lengthSeconds))
	}
	async showRelated() {
		return this.related.get().then(related => {
			if (related.length) {
				return new Discord.MessageEmbed()
				.setTitle("Related content from YouTube")
				.setDescription(
					related.map((v, i) =>
						`${i+1}. **${Discord.Util.escapeMarkdown(v.title)}** (${common.prettySeconds(v.lengthSeconds)})`
						+`\n — ${v.author}`
					)
				)
				.setFooter("Play one of these? &music related play <number>, or &m rel p <number>")
				.setColor(0x36393f)
			} else {
				return "No related content available for the current song."
			}
		}).catch(() => {
			this.typeWhileGetRelated = false
			return ""
				+`Invidious didn't return valid data.`
				+`\n<https://invidio.us/api/v1/videos/${this.id}>`
				+`\n<https://invidio.us/v/${this.id}>`
				+`\n<https://youtu.be/${this.id}>`
		})
	}
	showInfo() {
		return Promise.resolve(`https://www.youtube.com/watch?v=${this.id}`)
	}
	async prepare() {
		if (this.track == "!") {
			this.track = await common.invidious.getTrack(this.id)
		}
	}
	destroy() {
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

		if (!stationData.has(this.station)) throw new Error("Unsupported station: "+this.station)

		this.title = stationData.get(this.station).title
		this.queueLine = `**${stationData.get(this.station).queue}** (LIVE)`
		this.track = data.track || "!"
		this.lengthSeconds = 0
		this.npUpdateFrequency = 15000
		this.typeWhileGetRelated = false
		this.noPauseReason = "You can't pause live radio."

		this.friskyStation = frisky.managers.stream.stations.get(this.station)
		this.stationMixGetter = new utils.AsyncValueCache(
			/**
			 * @returns {Promise<import("frisky-client/lib/Mix")>}
			 */
			() => new Promise((resolve, reject) => {
				let time = Date.now()
				let attempts = 0

				const attempt = () => {
					const retry = (reason) => {
						if (attempts < 3) {
							setTimeout(() => {
								attempt()
							}, 1000)
						} else {
							reject(reason)
						}
					}

					attempts++
					let index = this.friskyStation.findNowPlayingIndex()
					if (index == null) return retry("Current item is unknown")
					let mix = this.friskyStation.getSchedule()[index].mix
					if (!mix) return retry("Current mix not available")
					let data = mix.data
					if (!data) return retry("Current mix data not available")
					//console.log("Retrieved Frisky station data in "+(Date.now()-time)+"ms")
					return resolve(mix)
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
			station: this.station
		}
	}
	getRelated() {
		return Promise.resolve([])
	}
	showRelated() {
		return Promise.resolve("Try the other stations on Frisky Radio! `&frisky`, `&frisky deep`, `&frisky chill`")
	}
	showInfo() {
		return this.stationMixGetter.get().then(mix => {
			let stationCase = this.station[0].toUpperCase() + this.station.slice(1).toLowerCase()
			let embed = new Discord.MessageEmbed()
			.setColor(0x36393f)
			.setTitle("FRISKY: "+mix.data.title)
			.setURL("https://beta.frisky.fm/mix/"+mix.id)
			//.setThumbnail(mix.data...)
			.addField("Details",
				`Show: ${mix.data.title.split(" - ")[0]} / [view](https://beta.frisky.fm/shows/${mix.data.show_id.id})`
				+`\nEpisode: ${mix.data.title} / [view](https://beta.frisky.fm/mix/${mix.id})`
				//+"\nArtist: "+data.episode.artist_title
				+"\nGenre: "+mix.data.genre.join(", ")
				//+"\nEpisode genres: "+data.episode.genre.join(", ")
				//+"\nShow genres: "+data.show.genre.join(", ")
				+"\nStation: "+stationCase
			)
			if (mix.episode) {
				embed.setThumbnail(mix.episode.data.thumbnail.url)
			}
			if (mix.data.track_list && mix.data.track_list.length) {
				let trackList = mix.data.track_list
				.slice(0, 6)
				.map(track => track.artist + " - " + track.title)
				.join("\n")
				let hidden = mix.data.track_list.length-6
				if (hidden > 0) trackList += `\n_and ${hidden} more..._`
				embed.addField("Track list", trackList)
			}
			return embed
		}).catch(reason => {
			console.error(reason)
			return "Unfortunately, we failed to retrieve information about the current song."
		})
	}
	getProgress(time, paused) {
		let part = "= ⋄ ==== ⋄ ==="
		let fragment = part.substr(7-this._filledBarOffset, 7)
		let bar = "​"+fragment.repeat(5)+"​" //SC: ZWSP x 2
		this._filledBarOffset++
		if (this._filledBarOffset >= 7) this._filledBarOffset = 0
		time = common.prettySeconds(time)
		return `\`[ ${time} ​${bar}​ LIVE ]\`` //SC: ZWSP x 2
	}
	async prepare() {
		this.bound = this.stationUpdate.bind(this)
		this.friskyStation.events.addListener("changed", this.bound)
		await this.stationUpdate()
		if (this.track == "!") {
			return common.getTracks(stationData.get(this.station).beta_url).then(tracks => {
				if (tracks[0] && tracks[0].track) {
					this.track = tracks[0].track
				} else {
					console.error(tracks)
					this.error = "No tracks available for station "+this.station
				}
			})
		} else {
			return Promise.resolve()
		}
	}
	stationUpdate() {
		this.stationMixGetter.clear()
		return this.stationMixGetter.get().then(mix => {
			//console.log(mix)
			this.title = mix.data.title
		}).catch(reason => {
			console.error(reason)
		})
	}
	destroy() {
		this.friskyStation.events.removeListener("changed", this.bound)
	}
}

function makeYouTubeSongFromData(data) {
	return new YouTubeSong(data.info.identifier, data.info.title, Math.ceil(data.info.length/1000))
}
module.exports.makeYouTubeSongFromData = makeYouTubeSongFromData

/**
 * @typedef {Object} FriskyNowPlayingItem
 * @property {string} station
 * @property {{currentlisteners: number, peaklisteners: number, maxlisteners: number, uniquelisteners: number, averagetime: number, servergenre: string, serverurl: string, servertitle: string, songtitle: string, nexttitle: string, streamhits: number, streamstatus: number, backupstatus: number, streamsource: string, streampath: string, streamuptime: number, bitrate: number, content: string, version: string}} server
 * @property {string} title
 * @property {FriskyEpisode} episode
 * @property {FriskyShow} show
 */

/**
 * @typedef {Object} FriskyEpisode
 * @property {number} id
 * @property {string} title
 * @property {string} url
 * @property {string} full_url
 * @property {number} artist_id
 * @property {Array<string>} genre
 * @property {Array<string>} track_list
 * @property {{url: string, mime: string, filename: string, filesize: number, s3_filename: string}} mix_url
 * @property {{url: string, mime: string, filename: string, filesize: number, s3_filename: string}} mix_url_64k
 * @property {number} show_id
 * @property {string} included_as
 * @property {string} allow_playing
 * @property {number} reach
 * @property {string} artist_title
 * @property {string} [artist_url]
 * @property {string} [artist_home_city]
 * @property {string} [artist_residency]
 * @property {string} artist_genre
 * @property {string} artist_biography
 * @property {FriskyThumb} artist_photo
 * @property {string} [artist_facebook_url]
 * @property {string} [artist_myspace_url]
 * @property {string} [artist_twitter_url]
 * @property {string} [artist_website_url]
 * @property {string} [artist_musical_influences]
 * @property {string} [artist_favorite_venues]
 * @property {string} [artist_status]
 * @property {string} show_title
 * @property {string} show_url
 * @property {string} show_summary
 * @property {Array<string>} show_genre
 * @property {number} show_artist_id
 * @property {FriskyThumb} show_image
 * @property {FriskyThumb} show_thumbnail
 * @property {FriskyThumb} show_album_art
 * @property {string} show_type
 * @property {string} show_status
 * @property {number} occurrence_id
 * @property {string} occurrence_title
 * @property {string} occurrence_url
 * @property {string} occurrence_summary
 * @property {string} occurrence_genre
 * @property {number} occurrence_artist_id
 * @property {FriskyThumb} occurrence_image
 * @property {FriskyThumb} occurrence_thumbnail
 * @property {FriskyThumb} occurrence_album_art
 * @property {string} occurrence_status
 * @property {string} occurrence_location
 * @property {string} occurrence_type
 * @property {string} show_location
 * @property {string} show_channel_title
 */

/**
 * @typedef {Object} FriskyShow
 * @property {number} id
 * @property {string} title
 * @property {string} url
 * @property {string} summary
 * @property {Array<string>} genre
 * @property {number} artist_id
 * @property {FriskyThumb} image
 * @property {FriskyThumb} thumbnail
 * @property {FriskyThumb} album_art
 * @property {string} type
 * @property {string} status
 * @property {string} channel_title
 * @property {Date} modification_time
 * @property {string} location
 * @property {Date} next_episode
 */

/**
 * @typedef {Object} FriskyThumb
 * @property {string} url
 * @property {string} mime
 * @property {string} filename
 * @property {number} filesize
 * @property {string} thumb_url
 * @property {string} custom_url
 * @property {number} image_width
 * @property {string} s3_filename
 * @property {number} thumb_width
 * @property {number} image_height
 * @property {string} s3_thumbname
 * @property {number} thumb_height
 * @property {number} thumb_filesize
 */

 /**
 * @typedef {Object} FriskyMixResponse
 * @property {Object} data
 * @property {boolean} data.success
 * @property {string} data.error
 * @property {Object} data.mp3_url
 * @property {number} data.mp3_url.expires
 * @property {string} data.mp3_url.path
 */

module.exports.Song = Song
module.exports.YouTubeSong = YouTubeSong
module.exports.FriskySong = FriskySong
