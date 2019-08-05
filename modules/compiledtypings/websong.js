const events = require("events");

module.exports = class WebSong {
	constructor() {
		/** @type {events.EventEmitter} */
		this.events;
	}
	/**
	 * @returns {{title: String, length: Number, thumbnail: String}}
	 */
	webInfo() {}
}