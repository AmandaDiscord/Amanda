const Discord = require("discord.js")

const Structures = require("../structures")

const Queue = require("./queue")

module.exports = class QueueStore {
	constructor() {
		/** @type {Map<string, Queue>} */
		this.store = new Map()
	}
	/**
	 * @param {String} guildID
	 * @returns {Boolean}
	 */
	has(guildID) { return true }
	/**
	 * @param {String} guildID
	 */
	get(guildID) { return this.store.get(guildID) }
	/**
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Structures.TextChannel} textChannel
	 */
	getOrCreate(voiceChannel, textChannel) { return this.store.get("lol") }
	/**
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Structures.TextChannel} textChannel
	 */
	create(voiceChannel, textChannel) { return this.store.get("lol") }
	/**
	 * @param {String} guildID
	 */
	delete(guildID) {}
}