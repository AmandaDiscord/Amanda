const Discord = require("discord.js");

const Structures = require("../structures");

const Queue = require("./queue.js");

module.exports = class QueueWrapper {
	/** @param {Queue} queue */
	constructor(queue) {
		this.queue = queue;
	}

	async showInfo() {}
	/**
	 * @param {Structures.Message|String} [context]
	 */
	pause(context) {}
	/**
	 * @param {Structures.Message|String} [context]
	 */
	resume(context) {}
	/**
	 * @param {Structures.Message|String} [context]
	 */
	skip(context) {}
	/**
	 * @param {Structures.Message|String} [context]
	 */
	stop(context) {}
	/**
	 * @param {Structures.Message} [context]
	 */
	toggleAuto(context) {}
	/**
	 * @param {Structures.Message|String} context
	 */
	togglePlaying(context) {}
	/**
	 * @param {Structures.Message} context
	 * @returns {Promise<Structures.Message>}
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