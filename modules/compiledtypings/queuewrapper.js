const Discord = require("discord.js");

const Structures = require("../structures");

const Queue = require("./queue.js");

module.exports = class QueueWrapper {
	/**
	 * @param {Queue} queue
	 */
	constructor(queue) {
		this.queue = queue
	}
	togglePlaying(context) {}
	skip(context) {}
	stop(context) {}
	/**
	 * @param {Structures.TextChannel} channel
	 */
	async showRelated(channel) {}
	/**
	 * @param {Number} index
	 */
	async playRelated(index, context) {}
}