const Discord = require("discord.js")
const lavalink = require("discord.js-lavalink")

const Structures = require("../structures")
const Amanda = require("../structures/Discord/Amanda")

let Song = require("./youtubesong")
let QueueWrapper = require("./queuewrapper")
let QueueStore = require("./queuestore")
let FrequencyUpdater = require('./frequencyupdater')
let client = new Amanda();
let BetterTimeout = require("./bettertimeout")

// @ts-ignore
require("../../types.js");

module.exports = class Queue {
	/**
	 * @param {QueueStore} store
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Structures.TextChannel} textChannel
	 */
	constructor(store, voiceChannel, textChannel) {
		this.store = store
		this.guildID = voiceChannel.guild.id
		this.voiceChannel = voiceChannel
		this.textChannel = textChannel
		/** @type {QueueWrapper} */
		this.wrapper;
		this.songStartTime = 0
		this.pausedAt = null
		/** @type {Song[]} */
		this.songs = []
		/** @type {lavalink.Player} */
		this.player
		/** @type {Structures.Message} */
		this.np = null
		/** @type {import("../../modules/managers/Discord/ReactionMenu.js")} */
		this.npMenu
		/** @type {FrequencyUpdater} */
		this.npUpdater
		/** @type {BetterTimeout} */
		this.voiceLeaveTimeout
		/** @type {Promise<Structures.Message>} */
		this.voiceLeaveWarningMessagePromise;
	}
	async play() {}
	_startNPUpdates() {}
	/**
	 * @param {LLEndEvent} event
	 */
	_onEnd(event) {}
	_nextSong() {}
	_dissolve() {}
	/**
	 * @returns {String?}
	 */
	pause() { return "" }
	resume() {}
	skip() {}
	stop() {}
	/**
	 * @param {Song} song
	 * @param {Number|Boolean} [insert]
	 * @returns {0|1}
	 */
	addSong(song, insert) { return true?1:0 }
	/**
	 * @param {Number} index
	 * @returns {1|0|2}
	 */
	removeSong(index) { return true?1:true?0:2 }
	/**
	 * @param {Number} index
	 * @returns {Promise<0|1>}
	 */
	async playRelated(index) { return true?1:0 }
	get time() { return 0 }
	get timeSeconds() { return 0 }
	get isPaused() { return true }
	getTotalLength() { return 0 }
	_buildNPEmbed() { return new Discord.MessageEmbed() }
	/**
	 * @param {Boolean} force
	 * @returns {Promise<void>}
	 */
	sendNewNP(force = false) { return Promise.resolve(undefined) }
	/**
	 * @param {Discord.VoiceState} oldstate
	 * @param {Discord.VoiceState} newstate
	 */
	voiceStateUpdate(oldstate, newstate) {}
}