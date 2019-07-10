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

	class Song {
		/**
		 * @param {String} title
		 * @param {String} source
		 * @param {Boolean} live
		 * @constructor
		 */
		constructor(title, source, live) {
			this.title = title;
			this.source = source;
			this.live = live;
			this.streaming = false;
			this.queue = null;
			this.connectionPlayFunction = "playStream";
			this.progressUpdateFrequency = 5000
		}
		/**
		 * @returns {any}
		 */
		toObject() {
			return Object.assign({
				title: this.title,
				source: this.source,
				live: this.live
			}, this.object());
		}
		/**
		 * @returns {any}
		 */
		object() {
			// Intentionally empty. Subclasses should put additional properties for toObject here.
		}
		/**
		 * @returns {any}
		 */
		stream() {
			// Intentionally empty.
		}
		/**
		 * @returns {any}
		 */
		getStream() {
			this.streaming = true;
			return this.stream();
		}
		/**
		 * @returns {Promise<Array<any>>}
		 */
		async related() {
			return [];
		}
		getInfo() {
			return "This song type doesn't have a method to get info."
		}
		getProgress() {
			return "This song type doesn't have a method to render progress."
		}
		destroy() {
			this.queue = null
		}
	}

	class YouTubeSong extends Song {
		/**
		 * @param {ytdl.videoInfo} info
		 * @param {Boolean} cache
		 * @constructor
		 */
		constructor(info, cache) {
			super(info.title, "YouTube", false);
			this.connectionPlayFunction = "playOpusStream";
			this.url = info.video_url;
			this.basic = {
				id: info.video_id,
				title: info.title,
				author: info.author.name,
				length_seconds: +info.length_seconds
			}
			if (cache) this.info = info;
			else this.info = null;
		}
		object() {
			return {
				basic: this.basic
			}
		}
		toUnified() {
			return {
				title: this.title,
				author: this.basic.author,
				thumbnailSmall: `https://i.ytimg.com/vi/${this.basic.id}/mqdefault.jpg`,
				thumbnailLarge: `https://i.ytimg.com/vi/${this.basic.id}/hqdefault.jpg`,
				length: common.prettySeconds(this.basic.length_seconds),
				lengthSeconds: this.basic.length_seconds
			}
		}
		deleteCache() {
			this.info = null;
		}
		/**
		 * @returns {Promise<any>}
		 */
		stream() {
			return this.getInfo(true).then(info => ytdlDiscord.downloadFromInfo(info));
		}
		/**
		 * @param {Boolean} cache
		 * @param {Boolean} force
		 */
		getInfo(cache, force = undefined) {
			if (this.info || force) return Promise.resolve(this.info);
			else {
				return ytdl.getInfo(this.basic.id).then(info => {
					if (cache) this.info = info;
					return info;
				});
			}
		}
		/**
		 * @returns {Promise<Array<any>>}
		 */
		async related() {
			await this.getInfo(true);
			return this.info.related_videos.filter(v => v.title && +v.length_seconds > 0).slice(0, 10);
		}
		getProgress() {
			let max = this.basic.length_seconds;
			let rightTime = common.prettySeconds(max)
			if (this.queue && this.queue.dispatcher) {
				var current = Math.floor(this.queue.dispatcher.time/1000);
				if (current > max) current = max;
				var leftTime = common.prettySeconds(current)
				var paused = this.queue.dispatcher.paused
			} else {
				var current = 0
				var leftTime = "0:00"
				var paused = false
			}
			let bar = utils.progressBar(35, current, max, paused ? " [PAUSED] " : "")
			return `\`[ ${leftTime} ${bar} ${rightTime} ]\``;
		}
	}

	class FriskySong extends Song {
		/**
		 * @param {String} station
		 * @constructor
		 */
		constructor(station) {
			super("Frisky Radio", "Frisky", true);
			this.station = station;
			this.updateTitleTimeout = new utils.BetterTimeout()
			this.actuallyStreaming = false
			this.filledBarOffset = 0
			this.progressUpdateFrequency = 15000
			this.info = null
		}
		object() {
			return {
				station: this.station
			}
		}
		toUnified() {
			return {
				title: this.title,
				author: "Frisky Radio",
				thumbnailSmall: "/images/frisky.png",
				thumbnailLarge: "/images/frisky.png",
				length: "LIVE"
			}
		}
		/**
		 * @returns {Promise<Array<net.Socket>>}
		 */
		async stream() {
			let host, path;
			if (this.station == "frisky") {
				host = "stream.friskyradio.com", path = "/frisky_mp3_hi";
			} else if (this.station == "deep") {
				host = "deep.friskyradio.com", path = "/friskydeep_aachi";
			} else if (this.station == "chill") {
				host = "chill.friskyradio.com", path = "/friskychill_mp3_high";
			} else {
				throw new Error("song.station was "+this.station+", expected 'frisky', 'deep' or 'chill'");
			}
			await this._updateTitle()
			this._updateTitleNextMinute()
			let socket = new net.Socket();
			return new Promise(resolve => socket.connect(80, host, () => {
				socket.write(`GET ${path} HTTP/1.0\r\n\r\n`);
				resolve([socket, socket]);
				socket.once("data", () => {
					this.actuallyStreaming = true;
				})
			}));
		}
		_updateTitle() {
			return rp("https://www.friskyradio.com/api/v2/nowPlaying").then(body => {
				let data = JSON.parse(body)
				let title = "Frisky Radio"
				let item = data.data.items.find(i => i.station == this.station);
				this.info = item
				if (this.station != "frisky") title += " ⧸ "+this.station[0].toUpperCase()+this.station.slice(1);
				if (item && item.episode) title += " ⧸ "+item.episode.show_title+" ⧸ "+item.episode.artist_title
				this.title = title
			}).catch(console.error)
		}
		_updateTitleNextMinute() {
			this.updateTitleTimeout.clear()
			this.updateTitleTimeout = new utils.BetterTimeout(() => {
				this._updateTitle()
				this._updateTitleNextMinute()
			}, 1000*60)
		}
		_getFilledBar() {
			let part = "= ⋄ ==== ⋄ ==="
			let fragment = part.substr(7-this.filledBarOffset, 7)
			let bar = "​"+fragment.repeat(5)+"​"
			this.filledBarOffset++
			if (this.filledBarOffset >= 7) this.filledBarOffset = 0
			return bar
		}
		getProgress() {
			if (this.queue && this.queue.dispatcher) {
				var time = common.prettySeconds(Math.floor(this.queue.dispatcher.time/1000))
			} else {
				var time = "0:00"
			}
			let bar = this.actuallyStreaming ? this._getFilledBar() : "- ".repeat(17)+"-"
			return `\`[ ${time} ${bar} LIVE ]\``
		}
		destroy() {
			Song.prototype.destroy.call(this)
			this.updateTitleTimeout.clear()
		}
		async getInfo() {
			if (!this.info) await this._updateTitle()
			let nextEpisode = await rp("https://www.friskyradio.com/api/v2/shows"+this.info.episode.full_url, {json: true}).then(data => new Date(data.data.show.next_episode)).catch(() => "")
			if (nextEpisode) {
				let hours = nextEpisode.getUTCHours()
				if (hours < 12) {
					hours += " AM"
				} else {
					hours = (hours - 12) + " PM"
				}
				nextEpisode = "\nNext episode: "+nextEpisode.toUTCString().split(" ").slice(0, 4).join(" ")+" at "+hours+" UTC"
			}
			return new Discord.RichEmbed()
			.setThumbnail(this.info.episode.occurrence_album_art.url)
			.setTitle("FRISKY: "+this.info.title)
			.setURL("https://www.friskyradio.com/show"+this.info.episode.full_url)
			.setDescription(this.info.episode.occurrence_summary)
			.addField("Details",
				`Show: ${this.info.show.title} / [view](https://www.friskyradio.com/show/${this.info.episode.show_url})`
				+`\nEpisode: ${this.info.episode.occurrence_title} / [view](https://www.friskyradio.com/show${this.info.episode.full_url})`
				+"\nArtist: "+this.info.episode.artist_title
				+"\nEpisode genres: "+this.info.episode.genre.join(", ")
				+"\nShow genres: "+this.info.show.genre.join(", ")
				+"\nStation: "+this.info.episode.show_channel_title
				+nextEpisode
			)
			.addField("Track list", this.info.episode.track_list.map((v, i) => (i+1)+". "+v).join("\n"))
			.setColor("e9268f")
		}
	}

	return {Song, YouTubeSong, FriskySong}
}