const Discord = require("discord.js");
const events = require("events");

let Queue = require("../../compiledtypings/queue.js");

class QueueManager {
	constructor() {
		/**
		 * @type {Discord.Collection<String, Queue>}
		 */
		this.storage = new Discord.Collection();
		this.events = new events.EventEmitter();
		this.songsPlayed = 0;
	}
	/**
	 * @param {Queue} queue
	 */
	addQueue(queue) {
		this.storage.set(queue.id, queue);
		this.events.emit("new", queue);
	}
}
module.exports = QueueManager;