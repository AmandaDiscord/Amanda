const ytdl = require("ytdl-core")
const stream = require("stream")
const Discord = require("discord.js")

let Song = require("./song.js")
let Queue = require("./queue")
let AsyncValueCache = require("./asyncvaluecache")

module.exports = class YouTubeSong extends Song {
	/**
	 * @param {String} id
	 * @param {String} title
	 * @param {Number} lengthSeconds
	 * @param {String?} track
	 */
	constructor(id, title, lengthSeconds, track = undefined) {
		super()
		this.id = id
		this.title = title
		this.lengthSeconds = lengthSeconds
		this.track = track || "!"
		this.queueLine = ``
		this.npUpdateFrequency = 5000
		this.typeWhileGetRelated = true

		/** @type {AsyncValueCache} */
		this.related;

		this.validate()
	}
	/**
	 * @param {Number} time milliseconds
	 * @param {Boolean} paused
	 */
	getProgress(time, paused) {
		let max = this.lengthSeconds
		let rightTime = ""
		if (time > max) time = max
		let leftTime = ""
		let bar = ""
		return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
	}
	async getRelated() {
		let related = await this.related.get()
		return related.map(v => new YouTubeSong(v.videoId, v.title, v.lengthSeconds))
	}
	async showRelated() {
		let related = await this.related.get()
		if (related.length) {
			return new Discord.MessageEmbed()
			.setTitle("Related content from YouTube")
			.setDescription("")
			.setFooter("Play one of these? &music related play <number>, or &m rel p <number>")
			.setColor(0x36393f)
		} else {
			return "No related content available for the current item."
		}
	}
	prepare() {
		return Promise.resolve()
	}
}