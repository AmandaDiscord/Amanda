//@ts-check

const Discord = require("discord.js");

const passthrough = require("../../passthrough")
let { client, reloader } = passthrough

const QueueFile = require("../../commands/music/queue")
reloader.useSync("./commands/music/queue.js", QueueFile)

class QueueStore {
	constructor() {
		/** @type {Discord.Collection<string, QueueFile.Queue>} */
		this.store = new Discord.Collection()
		this.songsPlayed = 0
	}
	toObject() {
		return {
			_id: "QueueStore",
			queues: [...this.store.values()].map(q => q.toObject())
		}
	}
	/**
	 * @param {string} guildID
	 */
	has(guildID) {
		return this.store.has(guildID)
	}
	get(guildID) {
		return this.store.get(guildID)
	}
	/**
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Discord.TextChannel} textChannel
	 */
	getOrCreate(voiceChannel, textChannel) {
		let guildID = voiceChannel.guild.id
		if (this.store.has(guildID)) return this.store.get(guildID)
		else return this.create(voiceChannel, textChannel)
	}
	/**
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Discord.TextChannel} textChannel
	 */
	create(voiceChannel, textChannel) {
		let guildID = voiceChannel.guild.id
		let instance = new QueueFile.Queue(this, voiceChannel, textChannel)
		this.store.set(guildID, instance)
		return instance
	}
	/**
	 * Remove a queue from the store
	 * @param {string} guildID
	 */
	delete(guildID) {
		this.store.delete(guildID)
	}
	save() {
		return passthrough.nedb.queue.update({}, this.toObject(), {upsert: true})
	}
	async restore() {
		const songTypes = require("../../commands/music/songtypes")
		let data = await passthrough.nedb.queue.findOne({_id: "QueueStore"})
		data.queues.forEach(async q => {
			console.log(q)
			let guildID = q.guildID
			let voiceChannel = client.channels.get(q.voiceChannelID)
			let textChannel = client.channels.get(q.textChannelID)
			if (!(voiceChannel instanceof Discord.VoiceChannel) || !(textChannel instanceof Discord.TextChannel)) throw new Error("The IDs you saved don't match to channels, dummy")
			console.log("Making queue for voice channel "+voiceChannel.name)
			let exists = this.has(guildID)
			if (exists) {
				console.log("Queue already in store! Skipping.")
			} else {
				let queue = this.getOrCreate(voiceChannel, textChannel)
				q.songs.forEach(s => {
					if (s.class == "YouTubeSong") {
						let song = new songTypes.YouTubeSong(s.id, s.title, s.lengthSeconds, s.track)
						queue.songs.push(song)
						console.log("Added YouTubeSong "+song.title)
					} else if (s.class == "FriskySong") {
						let song = new songTypes.FriskySong(s.station, {track: s.track})
						queue.songs.push(song)
						console.log("Added FriskySong "+song.station)
					}
				})
				queue.songs[0].resume()
				queue.songStartTime = q.songStartTime
				queue.pausedAt = q.pausedAt
				let message = await textChannel.messages.fetch(q.npID, false)
				queue.np = message
				queue._startNPUpdates()
				queue._makeReactionMenu()
			}
		})
	}
}

module.exports = QueueStore
