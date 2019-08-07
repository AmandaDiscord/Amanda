const ytdl = require("ytdl-core");
const stream = require("stream");
const Discord = require("discord.js");

let WebSong = require("./websong.js");

module.exports = class YouTubeSong extends WebSong {
	/**
	 * @param {String} id
	 * @param {ytdl.videoInfo} [info]
	 * @param {Boolean} [cache]
	 * @param {{title: String, length_seconds: Number}} [basic]
	 * @constructor
	 */
	constructor(id, info, cache, basic) {
		super()
		this.id = id;
		this.connectionPlayFunction = "playOpusStream";
		/** @type {Boolean} */
		this.canBePaused;
		this.url = "https://youtu.be/"+id;
		/** @type {Error} */
		this.error;
		this.progressUpdateFrequency = 5000;
		this.info = info;
		this.basic = basic;
	}
	/**
	 * @returns {{src: String, width: number, height: number}}
	 */
	getThumbnail() {}
	_deleteCache() {}
	/**
	 * @returns {stream.Readable}
	 */
	getStream() {}
	/**
	 * @returns {Promise<Array<ytdl.relatedVideo>>}
	 */
	async _getRelated() {}
	/**
	 * @returns {Promise<Array<ytdl.relatedVideo>>}
	 */
	getRelated() {}
	/**
	 * @param {Set<String>} playedSongs
	 * @returns {Promise<YouTubeSong>}
	 */
	getSuggested(playedSongs) {}
	/**
	 * @returns {Promise<Discord.RichEmbed|"No related content available.">}
	 */
	showRelated() {}
	/**
	 * Returns null if failed. Examine this.error.
	 * @param {Boolean} cache Whether to cache the results if they are fetched
	 * @param {Boolean} [force=undefined] Whether to try to get from the existing cache first
	 * @returns {Promise<ytdl.videoInfo>}
	 */
	_getInfo(cache, force = undefined) {}
	/**
	 * @returns {Promise<Array<ytdl.relatedVideo>>}
	 */
	async _related() {}
	/**
	 * @param {Number} time
	 * @param {Boolean} paused
	 * @returns {String}
	 */
	getProgress(time, paused) {}
	destroy() {}
	prepare() {}
	/**
	 * @returns {String}
	 */
	getError() {}
	/**
	 * @returns {String}
	 */
	getTitle() {}
	/**
	 * @returns {String}
	 */
	getUniqueID() {}
	/**
	 * @returns {String}
	 */
	getUserFacingID() {}
	/**
	 * @returns {String}
	 */
	getDetails() {}
	clean() {}
	/**
	 * @returns {Number}
	 */
	getLength() {}
	/**
	 * @returns {String}
	 */
	getQueueLine() {}
}