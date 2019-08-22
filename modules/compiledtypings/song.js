const Discord = require("discord.js");

module.exports = class Song {
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
	/**
	 * @param {Number} time milliseconds
	 * @param {Boolean} paused
	 */
	getProgress(time, paused) {
		return ""
	}
	/**
	 * @returns {Promise<Song[]>}
	 */
	getRelated() {
		return Promise.resolve([])
	}
	/** @returns {Promise<String|Discord.MessageEmbed>} */
	showRelated() {
		return Promise.resolve("This isn't a real song.")
	}
	/**
	 * @param {String} message
	 */
	validationError(message) {
		console.error("Song validation error: "+this.constructor.name+" "+message)
	}
	validate() {
		["track", "title", "queueLine", "npUpdateFrequency"].forEach(key => {
			if (!this[key]) this.validationError("unset "+key)
		})
		;["getProgress", "getRelated", "showRelated"].forEach(key => {
			if (this[key] === Song.prototype[key]) this.validationError("unset "+key)
		})
		if (typeof(this.lengthSeconds) != "number" || this.lengthSeconds < 0) this.validationError("unset lengthSeconds")
		this.validated = true
	}
	prepare() {
		return Promise.resolve()
	}
}