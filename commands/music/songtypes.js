const Discord = require("discord.js")
const ytdlDiscord = require("ytdl-core-discord")
const ytdl = require("ytdl-core")
const net = require("net")
const rp = require("request-promise")
const events = require("events")
const stream = require("stream")

// @ts-ignore
require("../../types.js")

/**
 * @param {PassthroughType} passthrough
 */
module.exports = passthrough => {
	let {reloader} = passthrough

	let utils = require("../../modules/utilities.js")(passthrough)
	reloader.useSync("./modules/utilities.js", utils)

	let common = require("./common.js")(passthrough)
	reloader.useSync("./commands/music/common.js", common)

	class WebSong {
		constructor() {
			this.events = new events.EventEmitter()
		}
		/**
		 * @returns {{title: String, length: Number, thumbnail: String}}
		 */
		webInfo() {
			return {
				title: this.getTitle(),
				length: this.getLength(),
				thumbnail: this.getThumbnail(),
				live: this.isLive
			}
		}
		destroy() {
			this.events.removeAllListeners()
		}
	}

	class YouTubeSong extends WebSong {
		/**
		 * @param {String} id
		 * @param {ytdl.videoInfo} [info]
		 * @param {Boolean} [cache]
		 * @param {{title: String, length_seconds: Number}} [basic]
		 * @constructor
		 */
		constructor(id, info, cache, basic) {
			super()
			this.id = id
			this.streamType = "opus"
			this.canBePaused = true
			this.isLive = false
			this.url = "https://youtu.be/"+id
			this.error = null
			this.progressUpdateFrequency = 5000
			if (info) {
				this.basic = {
					title: info.title,
					length_seconds: +info.length_seconds
				}
				if (cache) this.info = info
				else this.info = null
			} else {
				if (basic) {
					this.basic = basic
				} else {
					this.basic = {
						title: "Loading...",
						length_seconds: 0
					}
					this._getInfo(cache)
				}
			}
		}
		getThumbnail() {
			return {
				src: `https://i.ytimg.com/vi/${this.id}/mqdefault.jpg`,
				width: 320,
				height: 180
			}
		}
		_deleteCache() {
			if (this.info instanceof Promise) {
				//console.log(this.getUniqueID()+" - deleteCache (promise)")
				this.info.then(() => {
					this.info = null
				})
			} else {
				//console.log(this.getUniqueID()+" - deleteCache (sync)")
			}
		}
		/**
		 * @returns {stream.Readable}
		 */
		getStream() {
			return this._getInfo(true).then(info => {
				if (info) {
					let streams = ytdlDiscord.downloadFromInfo(info)
					function streamErrorRedirector() {
						streams[0].emit("error", ...arguments)
					}
					streams[1].on("error", streamErrorRedirector)
					streams[1].once("close", () => {
						streams[1].removeListener("error", streamErrorRedirector)
					})
					return streams[0]
				} else {
					return null
				}
			})
		}
		/**
		 * @returns {Promise<Array<ytdl.relatedVideo>>}
		 */
		async _getRelated() {
			let info = await this._getInfo(true)
			return info.related_videos.filter(v => v.title && v.length_seconds > 0).map(v => {
				v.length_seconds = +v.length_seconds
				return v
			}).slice(0, 10)
		}
		getRelated() {
			return this._getRelated()
		}
		async getSuggested(index, playedSongs) {
			let videos = await this._getRelated()
			if (index != undefined) {
				if (!videos[index]) return null
				return new YouTubeSong(videos[index].id, undefined, true, videos[index])
			} else {
				let filtered = videos.filter(v => !playedSongs.has("youtube_"+v.id))
				if (filtered[0]) return new YouTubeSong(filtered[0].id, undefined, true, filtered[0])
				else return null
			}
		}
		showRelated() {
			return this._getRelated().then(videos => {
				if (videos.length) {
					return new Discord.MessageEmbed()
					.setTitle("Related videos")
					.setDescription(
						videos.map((v, i) =>
							`${i+1}. **${Discord.Util.escapeMarkdown(v.title)}** (${common.prettySeconds(v.length_seconds)})`
							+`\n — ${v.author}`
						)
					)
					.setColor(0x36393f)
					.setFooter(`Use "&music related <play|insert> <index>" to queue an item from this list.`)
				} else {
					return "No related content available."
				}
			})
		}
		/**
		 * Returns null if failed. Examine this.error.
		 * @param {Boolean} cache Whether to cache the results if they are fetched
		 * @param {Boolean} [force=undefined] Whether to try to get from the existing cache first
		 * @returns {Promise<ytdl.videoInfo>}
		 */
		_getInfo(cache, force = undefined) {
			if (this.info || force) return Promise.resolve(this.info)
			else {
				//console.log(this.getUniqueID()+" - getInfo")
				return this.info = ytdl.getInfo(this.id).then(info => {
					this.basic.title = info.title
					this.basic.length_seconds = +info.length_seconds
					this.events.emit("update")
					if (cache) this.info = info
					return info
				}).catch(error => {
					this.error = error
					this.basic.title = "Deleted video"
					this.basic.length_seconds = 0
					this.events.emit("update")
					return null
				})
			}
		}
		/**
		 * @returns {Promise<Array<ytdl.relatedVideo>>}
		 */
		async _related() {
			await this._getInfo(true)
			return this.info.related_videos.filter(v => v.title && +v.length_seconds > 0).slice(0, 10)
		}
		/**
		 * @param {Number} time
		 * @param {Boolean} paused
		 */
		getProgress(time, paused) {
			let max = this.basic.length_seconds
			let rightTime = common.prettySeconds(max)
			let current = Math.round(time/1000)
			if (current > max) current = max
			let leftTime = common.prettySeconds(current)
			let bar = utils.progressBar(35, current, max, paused ? " [PAUSED] " : "")
			return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
		}
		destroy() {
			this._deleteCache()
			WebSong.prototype.destroy.call(this)
		}
		prepare() {
			this._getInfo(true)
		}
		getError() {
			let error = this.error
			if (!error) return "No errors."
			let message = error.message
			if (message) message = "The error is: "+message
			else message = "The reason for this is unknown."
			if (!message.endsWith(".")) message = message+"."
			return `Failed to play YouTube video with ID \`${this.getUserFacingID()}\`. ${message}\n<https://youtube.com/watch?v=${this.getUserFacingID()}>`
		}
		getTitle() {
			return this.basic.title
		}
		getUniqueID() {
			return "youtube_"+this.getUserFacingID()
		}
		getUserFacingID() {
			return this.id
		}
		getDetails() {
			return this.url
		}
		clean() {
			this._deleteCache()
		}
		getLength() {
			return this.basic.length_seconds
		}
		getQueueLine() {
			return `**${this.getTitle()}** (${common.prettySeconds(this.getLength())})`
		}
	}

	function friskyDataToInfoEmbed(data, nextEpisode) {
		let embed = new Discord.MessageEmbed()
		.setThumbnail(data.episode.occurrence_album_art.url)
		.setTitle("FRISKY: "+data.title)
		.setURL("https://www.friskyradio.com/show"+data.episode.full_url)
		.setDescription(data.episode.occurrence_summary)
		.setColor("e9268f")
		.addField("Details",
			`Show: ${data.show.title} / [view](https://www.friskyradio.com/show/${data.episode.show_url})`
			+`\nEpisode: ${data.episode.occurrence_title} / [view](https://www.friskyradio.com/show${data.episode.full_url})`
			+"\nArtist: "+data.episode.artist_title
			+"\nEpisode genres: "+data.episode.genre.join(", ")
			+"\nShow genres: "+data.show.genre.join(", ")
			+"\nStation: "+data.episode.show_channel_title
			+nextEpisode
		)
		if (data.episode.track_list.length) embed.addField("Track list", data.episode.track_list.map((v, i) => (i+1)+". "+v).join("\n"))
		return embed
	}

	class FriskySong extends WebSong {
		/**
		 * @param {String} station Lowercase station from frisky, deep, chill
		 */
		constructor(station) {
			super()
			if (!["frisky", "deep", "chill"].includes(station)) {
				throw new Error(`FriskySong station was ${this.station}, expected one of frisky, deep, chill`)
			}
			this.station = station
			let parts =
				this.station == "frisky"
				? ["stream.friskyradio.com", "frisky_mp3_hi"]
				: this.station == "deep"
				? ["deep.friskyradio.com", "/friskydeep_aachi"]
				: ["chill.friskyradio.com", "/friskychill_mp3_high"]
			this.host = parts[0]
			this.path = parts[1]
			this.queue = null
			/** @type {FriskyNowPlayingItem} */
			this.info = null
			this.loadingStream = false
			this.filledBarOffset = 0
			this.progressUpdateFrequency = 15000
			this.streamType = "unknown"
			this.canBePaused = false
			this.isLive = true
			this.title = "Frisky Radio"
			if (this.station != "frisky") this.title += ": "+this._getStationTitle()
		}
		getThumbnail() {
			return {
				src: "/images/frisky-small.png",
				width: 320,
				height: 180
			}
		}
		getUniqueID() {
			return "frisky_"+this.station
		}
		getUserFacingID() {
			return this._getStationTitle()
		}
		getError() {
			return null
		}
		getTitle() {
			return this.title + (this.loadingStream ? " (loading...)" : "")
		}
		getProgress(time) {
			time = common.prettySeconds(Math.round(time/1000))
			let bar = this.loadingStream ? "- ".repeat(17)+"-" : this._getFilledBar()
			return `\`[ ${time} ${bar} LIVE ]\``
		}
		prepare() {
		}
		clean() {
		}
		/**
		 * @return {Promise<net.Socket>}
		 */
		async getStream() {
			this.loadingStream = true
			this.events.emit("update")
			let socket = new net.Socket()
			return Promise.all([
				this._startTitleUpdates(),
				new Promise(resolve => {
					socket.connect(80, this.host, () => {
						socket.write(`GET ${this.path} HTTP/1.0\r\n\r\n`)
						socket.once("data", () => {
							this.loadingStream = false
						})
						resolve(socket)
					})
				})
			]).then(array => array[1])
		}
		async getDetails() {
			let info = await this._getInfo()
			let nextEpisode = await this._fetchNextEpisode()
			return friskyDataToInfoEmbed(info, nextEpisode)
		}
		destroy() {
			this._stopTitleUpdates()
			WebSong.prototype.destroy.call(this)
		}
		_getStationTitle() {
			return this.station[0].toUpperCase()+this.station.slice(1)
		}
		_startTitleUpdates() {
			this.updateTitleInterval = setInterval(async () => {
				this._updateTitle(true)
			}, 60000)
			return this._updateTitle()
		}
		_stopTitleUpdates() {
			clearInterval(this.updateTitleInterval)
		}
		async _updateTitle(refresh = false) {
			let title = "Frisky Radio"
			if (this.station != "frisky") title += " / "+this._getStationTitle()
			let info = await this._getInfo(refresh)
			if (info && info.episode) title += " / "+info.episode.show_title+" / "+info.episode.artist_title
			this.title = title
		}
		/**
		 * @param {Boolean} [refresh]
		 * @returns {Promise<FriskyNowPlayingItem>}
		 */
		async _getInfo(refresh) {
			if (!refresh && this.info) return this.info
			return this.info = rp("https://www.friskyradio.com/api/v2/nowPlaying", {json: true}).then(data => {
				let item = data.data.items.find(i => i.station == this.station)
				this.info = item
				setTimeout(() => this.events.emit("update")) // allow the title to update first?
				return this.info
			}).catch(console.error)
		}
		_fetchNextEpisode() {
			return rp("https://www.friskyradio.com/api/v2/shows"+this.info.episode.full_url, {json: true}).then(data => {
				let date = new Date(data.data.show.next_episode)
				return "\nNext episode: "+utils.upcomingDate(date)
			}).catch(() => "")
		}
		_getFilledBar() {
			let part = "= ⋄ ==== ⋄ ==="
			let fragment = part.substr(7-this.filledBarOffset, 7)
			let bar = "​"+fragment.repeat(5)+"​"
			this.filledBarOffset++
			if (this.filledBarOffset >= 7) this.filledBarOffset = 0
			return bar
		}
		getLength() {
			return 0
		}
		getQueueLine() {
			return `**Frisky Radio: ${this._getStationTitle()}** (LIVE)`
		}
		getRelated() {
			return []
		}
		getSuggested() {
			return Promise.resolve(null)
		}
		showRelated() {
			return "Try the other stations on Frisky Radio! `&frisky`, `&frisky deep`, and `&frisky chill`."
		}
	}

	// Verify that songs have the right methods
	[YouTubeSong, FriskySong].forEach(song => {
		[
			"getUniqueID", "getUserFacingID", "getError", "getTitle", "getProgress", "getQueueLine", "getLength", "getThumbnail",
			"getStream", "getDetails", "destroy", "getProgress", "prepare", "clean", "getRelated", "getSuggested", "showRelated"
		].forEach(key => {
			if (!song.prototype[key]) throw new Error(`Song type ${song.name} does not have the required method ${key}`)
		})
	})

	return {YouTubeSong, FriskySong}
}

/**
 * @typedef {Object} FriskyNowPlayingItem
 * @property {String} station
 * @property {{currentlisteners: Number, peaklisteners: Number, maxlisteners: Number, uniquelisteners: Number, averagetime: Number, servergenre: String, serverurl: String, servertitle: String, songtitle: String, nexttitle: String, streamhits: Number, streamstatus: Number, backupstatus: Number, streamsource: String, streampath: String, streamuptime: Number, bitrate: Number, content: String, version: String}} server
 * @property {String} title
 * @property {FriskyEpisode} episode
 * @property {FriskyShow} show
 */

/**
 * @typedef {Object} FriskyEpisode
 * @property {Number} id
 * @property {String} title
 * @property {String} url
 * @property {String} full_url
 * @property {Number} artist_id
 * @property {Array<String>} genre
 * @property {Array<String>} track_list
 * @property {{url: String, mime: String, filename: String, filesize: Number, s3_filename: String}} mix_url
 * @property {{url: String, mime: String, filename: String, filesize: Number, s3_filename: String}} mix_url_64k
 * @property {Number} show_id
 * @property {String} included_as
 * @property {String} allow_playing
 * @property {Number} reach
 * @property {String} artist_title
 * @property {String} [artist_url]
 * @property {String} [artist_home_city]
 * @property {String} [artist_residency]
 * @property {String} artist_genre
 * @property {String} artist_biography
 * @property {FriskyThumb} artist_photo
 * @property {String} [artist_facebook_url]
 * @property {String} [artist_myspace_url]
 * @property {String} [artist_twitter_url]
 * @property {String} [artist_website_url]
 * @property {String} [artist_musical_influences]
 * @property {String} [artist_favorite_venues]
 * @property {String} [artist_status]
 * @property {String} show_title
 * @property {String} show_url
 * @property {String} show_summary
 * @property {Array<String>} show_genre
 * @property {Number} show_artist_id
 * @property {FriskyThumb} show_image
 * @property {FriskyThumb} show_thumbnail
 * @property {FriskyThumb} show_album_art
 * @property {String} show_type
 * @property {String} show_status
 * @property {Number} occurrence_id
 * @property {String} occurrence_title
 * @property {String} occurrence_url
 * @property {String} occurrence_summary
 * @property {String} occurrence_genre
 * @property {Number} occurrence_artist_id
 * @property {FriskyThumb} occurrence_image
 * @property {FriskyThumb} occurrence_thumbnail
 * @property {FriskyThumb} occurrence_album_art
 * @property {String} occurrence_status
 * @property {String} occurrence_location
 * @property {String} occurrence_type
 * @property {String} show_location
 * @property {String} show_channel_title
 */

/**
 * @typedef {Object} FriskyShow
 * @property {Number} id
 * @property {String} title
 * @property {String} url
 * @property {String} summary
 * @property {Array<String>} genre
 * @property {Number} artist_id
 * @property {FriskyThumb} image
 * @property {FriskyThumb} thumbnail
 * @property {FriskyThumb} album_art
 * @property {String} type
 * @property {String} status
 * @property {String} channel_title
 * @property {Date} modification_time
 * @property {String} location
 * @property {Date} next_episode
 */

/**
 * @typedef {Object} FriskyThumb
 * @property {String} url
 * @property {String} mime
 * @property {String} filename
 * @property {Number} filesize
 * @property {String} thumb_url
 * @property {String} custom_url
 * @property {Number} image_width
 * @property {String} s3_filename
 * @property {Number} thumb_width
 * @property {Number} image_height
 * @property {String} s3_thumbname
 * @property {Number} thumb_height
 * @property {Number} thumb_filesize
 */

 /**
 * @typedef {Object} FriskyMixResponse
 * @property {Object} data
 * @property {Boolean} data.success
 * @property {String} data.error
 * @property {Object} data.mp3_url
 * @property {Number} data.mp3_url.expires
 * @property {String} data.mp3_url.path
 */
