const ytdlDiscord = require("ytdl-core-discord");
const ytdl = require("ytdl-core");

module.exports = passthrough => {
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
			this.connectionPlayFunction = "playStream";
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
				length: prettySeconds(this.basic.length_seconds),
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
	}

	class FriskySong extends Song {
		/**
		 * @param {String} station
		 * @constructor
		 */
		constructor(station) {
			super("Frisky Radio", "Frisky", true);
			this.station = station;
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
				host = "chill.friskyradio.com", path = "/friskychill_mp3_hi";
			} else {
				throw new Error("song.station was "+this.station+", expected 'frisky', 'deep' or 'chill'");
			}
			let body = await rp("https://www.friskyradio.com/api/v2/nowPlaying");
			try {
				let data = JSON.parse(body);
				let item = data.data.items.find(i => i.station == song.station);
				if (item && utils.sp(item, "episode.title")) {
					song.title = "Frisky Radio: "+utils.sp(item, "episode.title");
					if (song.station != "frisky") song.title += ` (${song.station[0].toUpperCase()+song.station.slice(1)}`;
				}
			} catch (e) {}
			let socket = new net.Socket();
			return new Promise(resolve => socket.connect(80, host, () => {
				socket.write(`GET ${path} HTTP/1.0\r\n\r\n`);
				resolve([socket, socket]);
			}));
		}
	}

	return {Song, YouTubeSong, FriskySong}
}