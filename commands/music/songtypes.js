const Discord = require("discord.js")
const ytdlDiscord = require("ytdl-core-discord");
const ytdl = require("ytdl-core");
const net = require("net");
const rp = require("request-promise");

module.exports = passthrough => {
	let {reloader} = passthrough

	let utils = require("../../modules/utilities.js")(passthrough)
	reloader.useSync("./modules/utilities.js", utils)

	let common = require("./common.js")(passthrough)
	reloader.useSync("./commands/music/common.js", common)

	class YouTubeSong {
		/**
		 * @param {ytdl.videoInfo} info
		 * @param {Boolean} cache
		 * @constructor
		 */
		constructor(id, info, cache, basic) {
			this.id = id
			this.connectionPlayFunction = "playOpusStream"
			this.canBePaused = true
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
		 * Returns null if failed. Examine this.error.
		 * @param {Boolean} cache Whether to cache the results if they are fetched
		 * @param {Boolean} force Whether to try to get from the existing cache first
		 */
		_getInfo(cache, force = undefined) {
			if (this.info || force) return Promise.resolve(this.info)
			else {
				//console.log(this.getUniqueID()+" - getInfo")
				return this.info = ytdl.getInfo(this.id).then(info => {
					this.basic.title = info.title
					this.basic.length_seconds = +info.length_seconds
					if (cache) this.info = info
					return info
				}).catch(error => {
					this.error = error
					this.basic.title = "Deleted video"
					this.basic.length_seconds = 0
					return null
				})
			}
		}
		/**
		 * @returns {Promise<Array<any>>}
		 */
		async _related() {
			await this.getInfo(true);
			return this.info.related_videos.filter(v => v.title && +v.length_seconds > 0).slice(0, 10);
		}
		getProgress(time, paused) {
			let max = this.basic.length_seconds;
			let rightTime = common.prettySeconds(max)
			let current = Math.floor(time/1000);
			if (current > max) current = max;
			let leftTime = common.prettySeconds(current)
			let bar = utils.progressBar(35, current, max, paused ? " [PAUSED] " : "")
			return `\`[ ${leftTime} ${bar} ${rightTime} ]\``;
		}
		destroy() {
			this._deleteCache()
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

	class FriskySong {
		/**
		 * @param {String} station Lowercase station from frisky, deep, chill
		 */
		constructor(station) {
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
			this.info = null
			this.actuallyStreaming = false
			this.filledBarOffset = 0
			this.progressUpdateFrequency = 15000
			this.connectionPlayFunction = "playStream"
			this.canBePaused = false
			this.title = "Frisky Radio"
		}
		getUniqueID() {
			return "frisky_"+this.station
		}
		getUserFacingID() {
			return this.getStationTitle
		}
		getError() {
			return null
		}
		getTitle() {
			return this.title + (this.actuallyStreaming ? "" : " (loading...)")
		}
		getProgress(time) {
			time = common.prettySeconds(Math.floor(time/1000))
			let bar = this.actuallyStreaming ? this._getFilledBar() : "- ".repeat(17)+"-"
			return `\`[ ${time} ${bar} LIVE ]\``
		}
		prepare() {
		}
		clean() {
		}
		async getStream() {
			let socket = new net.Socket()
			return Promise.all([
				this._startTitleUpdates(),
				new Promise(resolve => {
					socket.connect(80, this.host, () => {
						socket.write(`GET ${this.path} HTTP/1.0\r\n\r\n`)
						socket.once("data", () => {
							this.actuallyStreaming = true
						})
						resolve(socket)
					})
				})
			]).then(array => array[1])
		}
		async getDetails() {
			let info = await this._getInfo()
			let nextEpisode = await this._fetchNextEpisode()
			let embed = new Discord.RichEmbed()
			.setThumbnail(info.episode.occurrence_album_art.url)
			.setTitle("FRISKY: "+info.title)
			.setURL("https://www.friskyradio.com/show"+info.episode.full_url)
			.setDescription(info.episode.occurrence_summary)
			.setColor("e9268f")
			.addField("Details",
				`Show: ${info.show.title} / [view](https://www.friskyradio.com/show/${info.episode.show_url})`
				+`\nEpisode: ${info.episode.occurrence_title} / [view](https://www.friskyradio.com/show${info.episode.full_url})`
				+"\nArtist: "+info.episode.artist_title
				+"\nEpisode genres: "+info.episode.genre.join(", ")
				+"\nShow genres: "+info.show.genre.join(", ")
				+"\nStation: "+info.episode.show_channel_title
				+nextEpisode
			)
			if (info.episode.track_list.length) embed.addField("Track list", info.episode.track_list.map((v, i) => (i+1)+". "+v).join("\n"))
			return embed
		}
		destroy() {
			this._stopTitleUpdates()
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
			if (this.station != "frisky") title += " ⧸ "+this._getStationTitle()
			let info = await this._getInfo(refresh)
			if (info && info.episode) title += " ⧸ "+info.episode.show_title+" ⧸ "+info.episode.artist_title
			this.title = title
		}
		async _getInfo(refresh) {
			if (!refresh && this.info) return this.info
			return this.info = rp("https://www.friskyradio.com/api/v2/nowPlaying", {json: true}).then(data => {
				let item = data.data.items.find(i => i.station == this.station)
				this.info = item
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
	}

	function makeYTSFromRow(row) {
		return new YouTubeSong({
			title: row.name,
			video_id: row.videoID,
			length_seconds: row.length,
			author: {name: "?"}
		}, false)
	}

	// Verify that songs have the right methods
	[YouTubeSong, FriskySong].forEach(song => {
		[
			"getUniqueID", "getUserFacingID", "getError", "getTitle", "getProgress", "getQueueLine", "getLength",
			"getStream", "getDetails", "destroy", "getProgress", "prepare", "clean"
		].forEach(key => {
			if (!song.prototype[key]) throw new Error(`Song type ${song.name} does not have the required method ${key}`)
		})
	})

	return {YouTubeSong, FriskySong, makeYTSFromRow}
}