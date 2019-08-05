const Discord = require("discord.js");

const Queue = require("./queue.js");

module.exports = class QueueWrapper {
	/** @param {Queue} queue */
	constructor(queue) {
		this.queue = queue;
	}

	async showInfo() {}
	/**
	 * @param {Discord.Message|String} context
	 */
	pause(context) {}
	/**
	 * @param {Discord.Message|String} context
	 */
	resume(context) {}
	/**
	 * @param {Discord.Message|String} context
	 */
	skip(context) {}
	/**
	 * @param {Discord.Message|String} context
	 */
	stop(context) {}
	/**
	 * @param {Discord.Message} context
	 */
	toggleAuto(context) {}
	/**
	 * @param {Discord.Message|String} context
	 */
	togglePlaying(context) {}
	/**
	 * @param {Discord.Message} context
	 * @returns {Discord.Message}
	 */
	getQueue(context) {}
}