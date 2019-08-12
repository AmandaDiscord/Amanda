const Discord = require("discord.js");
const events = require("events");

const Structures = require("../structures");
const managers = require("../managers");

let Song = require("./youtubesong.js");
let QueueWrapper = require("./queuewrapper.js");
let BetterTimeout = require("./bettertimeout.js");

// @ts-ignore
require("../../types.js");

module.exports = class Queue {
	/**
	 * @param {Structures.TextChannel} textChannel
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @constructor
	 */
	constructor(textChannel, voiceChannel) {
		this.textChannel = textChannel;
		this._voiceChannel = voiceChannel;
		this.id = this.textChannel.guild.id;
		/** @type {Discord.VoiceConnection} */
		this.connection;
		/** @type {Discord.StreamDispatcher} */
		this._dispatcher;
		/** @type {Set<String>} */
		this.playedSongs;
		/** @type {Array<Song>} */
		this.songs;
		/** @type {Boolean} */
		this.playing;
		/** @type {Boolean} */
		this.skippable;
		/** @type {Boolean} */
		this.auto;
		/** @type {Structures.Message} */
		this.nowPlayingMsg;
		this.queueManager = require("../managers.js").queueManager
		/** @type {QueueWrapper} */
		this.wrapper;
		/** @type {events.EventEmitter} */
		this.events;
		/** @type {BetterTimeout} */
		this.voiceLeaveTimeout;
		/** @type {Promise<Structures.Message>} */
		this.voiceLeaveWarningMessagePromise;
		/** @type {managers.ReactionMenu} */
		this.reactionMenu;
		this.npUpdateTimeout = setTimeout(() => "lol", 100);
		this.npUpdateInterval = setInterval(() => "lol", 100);
	}
	/**
	 * @returns {Discord.VoiceChannel}
	 */
	get voiceChannel() {}
	/**
	 * @returns {Discord.StreamDispatcher}
	 */
	get dispatcher() {}
	/**
	 * Destroy the current song,
	 * delete all songs,
	 * stop the current song,
	 * leave the voice channel,
	 * delete the reaction menu,
	 * remove from storage
	 */
	dissolve() {}
	/**
	 * Remove this queue from storage.
	 */
	destroy() {}
	/**
	 * @param {Song} song
	 * @param {Boolean} insert
	 * @returns {Number}
	 */
	addSong(song, insert) {}
	/**
	 * @param {Number} index
	 * @returns {0|1|2}
	 */
	removeSong(index) {}
	/**
	 * @param {Song} song
	 */
	announceSongInfoUpdate(song) {}
	/**
	 * @param {Discord.VoiceState} oldState
	 * @param {Discord.VoiceState} newState
	 */
	voiceStateUpdate(oldState, newState) {}
	/**
	 * @returns {Discord.MessageEmbed|String}
	 */
	getNPEmbed() {}
	generateReactions() {}
	/**
	 * Deactivate the old now playing message and send a new one.
	 * This does not wait for the reactions to generate.
	 */
	async sendNowPlaying() {}
	/**
	 * Update the existing now playing message once.
	 * Do not call this before the first Queue.play(), because the now playing message might not exist then.
	 * @returns {Promise<Error|Discord.MessageEmbed|String>}
	 */
	updateNowPlaying() {}
	/**
	 * Immediately update the now playing message, and continue to update it every few seconds, as defined by the song.
	 */
	startNowPlayingUpdates() {}
	/**
	 * Prevent further updates of the now playing message.
	 */
	stopNowPlayingUpdates() {}
	async play() {}
	playNext() {}
	/**
	 * @returns {Number} Status code. 0 success, 1 already paused, 2 live
	 */
	pause() {}
	/**
	 * @returns {Number} Status code. 0 success, 1 not paused
	 */
	resume() {}
	/**
	 * @returns {Number} Status code. 0 success, 1 paused
	 */
	skip() {}
	/**
	 * @returns {Number} Status code. 0 success
	 */
	stop() {}
	toggleAuto() {}
}