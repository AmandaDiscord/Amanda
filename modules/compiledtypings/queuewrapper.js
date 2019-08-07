const Discord = require("discord.js");

const Queue = require("./queue.js");

module.exports = class QueueWrapper {
	/** @param {Queue} queue */
	constructor(queue) {
		this.queue = queue;
	}

	async showInfo() {}
	/**
	 * @param {Discord.Message|String} [context]
	 */
	pause(context) {}
	/**
	 * @param {Discord.Message|String} [context]
	 */
	resume(context) {}
	/**
	 * @param {Discord.Message|String} [context]
	 */
	skip(context) {}
	/**
	 * @param {Discord.Message|String} [context]
	 */
	stop(context) {}
	/**
	 * @param {Discord.Message} [context]
	 */
	toggleAuto(context) {}
	/**
	 * @param {Discord.Message|String} context
	 */
	togglePlaying(context) {}
	/**
	 * @param {Discord.Message} context
	 * @returns {Promise<Discord.Message>}
	 */
	getQueue(context) {}
	/**
	 * @returns {Array<{id: String, name: String, avatar: String, isAmanda: Boolean}>}
	 */
	getMembers() {}
	/**
	 * @returns {{auto: Boolean}}
	 */
	getAttributes() {}
	/**
	 * @returns {{playing: Boolean, time: Number, songs: Array<{title: String, length: Number, thumbnail: String}>, members: Array<{id: String, name: String, avatar: String, isAmanda: Boolean}>, voiceChannel: {id: String, name: String}, attributes: {auto: Boolean}}}
	 */
	getState() {}
}