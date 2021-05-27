// @ts-check

const Discord = require("thunderstorm")
const { EventEmitter } = require("events")

const passthrough = require("../../passthrough")
const { client, sync, ipc, config } = passthrough

/** @type {import("../../commands/music/queue")} */
const QueueFile = sync.require("../../commands/music/queue")

/** @type {import("../utilities")} */
const utils = sync.require("../utilities")

const auditDestroyTimeout = 1000 * 60 * 5

class QueueManager {
	constructor() {
		/** @type {Discord.Collection<string, import("../../commands/music/queue").Queue>} */
		this.cache = new Discord.Collection()
		this.songsPlayed = 0
		this.events = new EventEmitter()
		/** @type {Map<string, Array<{ action: string, platform: string, user: string }>>} */
		this.audits = new Map()
		/** @type {Map<string, NodeJS.Timeout>} */
		this.enqueuedAuditDestructions = new Map()
		passthrough.queues = this
	}
	toObject() {
		return {
			_id: `QueueStore_${config.cluster_id}`,
			queues: [...this.cache.values()].map(q => q.toObject())
		}
	}
	/**
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Discord.PartialChannel} textChannel
	 * @param {string} [host]
	 */
	getOrCreate(voiceChannel, textChannel, host = null) {
		const guildID = voiceChannel.guild.id
		if (this.cache.has(guildID)) return Promise.resolve(this.cache.get(guildID))
		else {
			return this.create(voiceChannel, textChannel, host)
		}
	}
	/**
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Discord.PartialChannel} textChannel
	 * @param {string} [host]
	 * @returns {Promise<import("../../commands/music/queue").Queue>}
	 */
	async create(voiceChannel, textChannel, host = null) {
		const guildID = voiceChannel.guild.id
		/** @type {Discord.Guild} */
		// @ts-ignore
		const guild = await utils.cacheManager.guilds.get(guildID, true, true)
		if (this.audits.get(guildID)) {
			if (this.enqueuedAuditDestructions.get(guildID)) {
				clearTimeout(this.enqueuedAuditDestructions.get(guildID))
				this.enqueuedAuditDestructions.delete(guildID)
			}
		} else this.audits.set(guildID, [])
		if (!guild) {
			console.log(`Guild no longer exists to client? gid: ${guildID}`)
			return null
		}
		const instance = new QueueFile.Queue(this, voiceChannel, textChannel, guild, host)
		this.cache.set(guildID, instance)
		await ipc.replier.sendNewQueue(instance)
		this.events.emit("create", instance)
		return instance
	}
	/**
	 * Remove a queue from the store
	 * @param {string} guildID
	 */
	delete(guildID) {
		this.cache.delete(guildID)
		const timeout = setTimeout(() => this.audits.delete(guildID), auditDestroyTimeout)
		this.enqueuedAuditDestructions.set(guildID, timeout)
		ipc.replier.sendDeleteQueue(guildID)
		this.events.emit("delete", guildID)
	}
	save() {
		return passthrough.nedb.queue.update({ _id: `QueueStore_${config.cluster_id}` }, this.toObject(), { upsert: true })
	}
	async restore() {
		const songTypes = require("../../commands/music/songtypes")
		const data = await passthrough.nedb.queue.findOne({ _id: `QueueStore_${config.cluster_id}` })
		data.queues.forEach(async q => {
			// console.log(q)
			const guildID = q.guildID
			const voiceChannel = await utils.cacheManager.channels.get(q.voiceChannelID)
			const textChannel = await utils.cacheManager.channels.get(q.textChannelID)
			const host = q.host
			if (!(voiceChannel instanceof Discord.VoiceChannel) || !(textChannel instanceof Discord.TextChannel)) throw new Error("The IDs you saved don't match to channels, dummy")
			console.log(`Making queue for voice channel ${voiceChannel.name}`)
			const exists = this.cache.has(guildID)
			if (exists) console.log("Queue already in store! Skipping.")
			else {
				// @ts-ignore
				const queue = await this.getOrCreate(voiceChannel, textChannel, host)
				if (!queue) return
				q.songs.forEach(s => {
					if (s.class == "YouTubeSong") {
						const song = new songTypes.YouTubeSong(s.id, s.title, s.lengthSeconds, s.track, s.uploader)
						queue.songs.push(song)
						console.log(`Added YouTubeSong ${song.title}`)
					} else if (s.class == "FriskySong") {
						const song = new songTypes.FriskySong(s.station, { track: s.track })
						queue.songs.push(song)
						console.log(`Added FriskySong ${song.station}`)
					} else if (s.class === "SoundCloudSong") {
						const song = songTypes.makeSoundCloudSong(s.trackNumber, s.title, s.lengthSeconds, s.live, s.uri, s.track)
						queue.songs.push(song)
						console.log(`Added SoundCloudSong ${song.title}`)
					} else if (s.class === "SpotifySong") {
						// @ts-ignore
						const song = songTypes.makeSpotifySong({ track_number: s.trackNumber, duration_ms: s.durationMS, name: s.title, uri: s.uri, artists: [{ name: s.artist }] }, s.id, s.track)
						queue.songs.push(song)
						console.log(`Added SpotifySong ${song.title}`)
					} else if (s.class === "ExternalSong") {
						const song = songTypes.makeExternalSong(s.uri)
						// @ts-ignore
						queue.songs.push(song)
						console.log(`Added ExternalSong ${song.title}`)
					} else if (s.class === "ListenMoeSong") {
						const song = songTypes.makeListenMoeSong(s.station)
						queue.songs.push(song)
						console.log(`Added ListenMoeSong ${song.title}`)
					} else if (s.class === "NewgroundsSong") {
						const song = songTypes.makeNewgroundsSong(s)
						queue.songs.push(song)
						console.log(`Added NewgroundsSong ${song.title}`)
					} else if (s.class === "TwitterSong") {
						const song = songTypes.makeTwitterSong(s)
						queue.songs.push(song)
						console.log(`Added TwitterSong ${song.title}`)
					} else if (s.class === "iTunesSong") {
						const song = songTypes.makeiTunesSong(s)
						queue.songs.push(song)
						console.log(`Added iTunesSong ${song.title}`)
					}
				})
				if (queue.songs[0]) {
					queue.songs[0].resume()
				}
				queue.songStartTime = q.songStartTime
				queue.pausedAt = q.pausedAt
				queue.sendNewNP()
				queue._startNPUpdates()
				await ipc.replier.sendNewQueue(queue)
			}
		})
		setTimeout(() => passthrough.nedb.queue.update({ _id: `QueueStore_${config.cluster_id}` }, { _id: `QueueStore_${config.cluster_id}`, queues: [] }, { upsert: true }), 1000 * 60 * 2)
	}
}

module.exports = QueueManager
