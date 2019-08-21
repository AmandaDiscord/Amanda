//@ts-check

const Discord = require("discord.js")
const Structures = require("../../modules/structures")
const rp = require("request-promise")
const lavalink = require("discord.js-lavalink")

//@ts-ignore
require("../../types")

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { client, commands, reloader } = passthrough

	let utils = require("../../modules/utilities.js")(passthrough)
	reloader.useSync("./modules/utilities.js", utils)

	let common = require("./common.js")(passthrough)
	reloader.useSync("./commands/music/common.js", common)

	const stationData = new Map([
		["frisky", {title: "Frisky Radio", queue: "Frisky Radio: Frisky"}],
		["deep", {title: "Frisky Radio: Deep", queue: "Frisky Radio: Deep"}],
		["chill", {title: "Frisky Radio: Chill", queue: "Frisky Radio: Deep"}]
	])

	class Song {
		constructor() {
			this.title = ""
			this.queueLine = ""
			this.track = ""
			this.lengthSeconds = -1
			this.npUpdateFrequency = 0
			this.noPauseReason = ""
			this.error = ""
			this.typeWhileGetRelated = true
			
			this.validated = false
			setTimeout(() => {
				if (this.validated == false) this.validationError("must call validate() in constructor")
			})
		}
		/**
		 * @param {Number} time milliseconds
		 * @param {Boolean} paused
		 */
		getProgress(time, paused) {
			return ""
		}
		/**
		 * @returns {Promise<Song[]>}
		 */
		getRelated() {
			return Promise.resolve([])
		}
		/** @returns {Promise<String|Discord.MessageEmbed>} */
		showRelated() {
			return Promise.resolve("This isn't a real song.")
		}
		/**
		 * @param {String} message
		 */
		validationError(message) {
			console.error("Song validation error: "+this.constructor.name+" "+message)
		}
		validate() {
			["track", "title", "queueLine", "npUpdateFrequency"].forEach(key => {
				if (!this[key]) this.validationError("unset "+key)
			})
			;["getProgress", "getRelated", "showRelated"].forEach(key => {
				if (this[key] === Song.prototype[key]) this.validationError("unset "+key)
			})
			if (typeof(this.lengthSeconds) != "number" || this.lengthSeconds < 0) this.validationError("unset lengthSeconds")
			this.validated = true
		}
		prepare() {
			return Promise.resolve()
		}
	}

	class YouTubeSong extends Song {
		/**
		 * @param {String} id
		 * @param {String} title
		 * @param {Number} lengthSeconds
		 * @param {String?} track
		 */
		constructor(id, title, lengthSeconds, track = undefined) {
			super()
			this.id = id
			this.title = title
			this.lengthSeconds = lengthSeconds
			this.track = track || "!"
			this.queueLine = `**${this.title}** (${common.prettySeconds(this.lengthSeconds)})`
			this.npUpdateFrequency = 5000
			this.typeWhileGetRelated = true

			this.related = new utils.AsyncValueCache(
			/** @returns {Promise<any[]>} */
			() => {
				return rp(`https://invidio.us/api/v1/videos/${this.id}`, {json: true}).then(data => {
					this.typeWhileGetRelated = false
					return data.recommendedVideos.slice(0, 10)
				})
			})

			this.validate()
		}
		/**
		 * @param {Number} time milliseconds
		 * @param {Boolean} paused
		 */
		getProgress(time, paused) {
			let max = this.lengthSeconds
			let rightTime = common.prettySeconds(max)
			if (time > max) time = max
			let leftTime = common.prettySeconds(time)
			let bar = utils.progressBar(35, time, max, paused ? " [PAUSED] " : "")
			return `\`[ ${leftTime} ${bar} ${rightTime} ]\``
		}
		async getRelated() {
			let related = await this.related.get()
			return related.map(v => new YouTubeSong(v.videoId, v.title, v.lengthSeconds))
		}
		async showRelated() {
			let related = await this.related.get()
			if (related.length) {
				return new Discord.MessageEmbed()
				.setTitle("Related content from YouTube")
				.setDescription(
					related.map((v, i) =>
						`${i+1}. **${Discord.Util.escapeMarkdown(v.title)}** (${common.prettySeconds(v.lengthSeconds)})`
						+`\n — ${v.author}`
					)
				)
				.setFooter("Play one of these? &music related play <number>, or &m rel p <number>")
				.setColor(0x36393f)
			} else {
				return "No related content available for the current item."
			}
		}
		prepare() {
			if (this.track == "!") {
				return getTracks(this.id).then(tracks => {
					if (tracks[0] && tracks[0].track) {
						this.track = tracks[0].track
					} else {
						console.error(tracks)
						this.error = "No tracks available for ID "+this.id
					}
				})
			} else {
				return Promise.resolve()
			}
		}
	}

	function makeYouTubeSongFromData(data) {
		return new YouTubeSong(data.info.identifier, data.info.title, Math.ceil(data.info.length/1000), data.track)
	}

	class FriskySong extends Song {
		constructor(station, data) {
			super()

			this.station = station

			this.title = stationData.get(station).title
			this.queueLine = `**${stationData.get(this.station).queue}** (LIVE)`
			this.track = data.track
			this.lengthSeconds = 0
			this.npUpdateFrequency = 15000
			this.typeWhileGetRelated = false
			this.noPauseReason = "You can't pause live radio."

			this._filledBarOffset = 0

			this.validate()
		}
		getRelated() {
			return Promise.resolve([])
		}
		showRelated() {
			return Promise.resolve("Try the other stations on Frisky Radio! `&frisky`, `&frisky deep`, `&frisky chill`")
		}
		getProgress(time, paused) {
			let part = "= ⋄ ==== ⋄ ==="
			let fragment = part.substr(7-this._filledBarOffset, 7)
			let bar = "​"+fragment.repeat(5)+"​"
			this._filledBarOffset++
			if (this._filledBarOffset >= 7) this._filledBarOffset = 0
			time = common.prettySeconds(time)
			return `\`[ ${time} ​${bar}​ LIVE ]\`` //SC: ZWSP x 2
		}
	}

	class Queue {
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
			this.wrapper = new QueueWrapper(this)
			this.songStartTime = 0
			this.pausedAt = null
			/** @type {Song[]} */
			this.songs = []
			/** @type {lavalink.Player} */
			// @ts-ignore
			this.player = client.lavalink.join({
				guild: this.guildID,
				channel: this.voiceChannel.id,
				host: client.lavalink.nodes.first().host
			})
			// @ts-ignore
			this.player.on("end", event => this._onEnd(event))
			this.player.on("playerUpdate", data => {
				this.songStartTime = data.state.time - data.state.position
			})
			/** @type {Structures.Message} */
			this.np = null
			/** @type {import("../../modules/managers/Discord/ReactionMenu.js")} */
			this.npMenu = null
			this.npUpdater = new utils.FrequencyUpdater(() => {
				if (this.np) this.np.edit(this._buildNPEmbed())
			})
		}
		/**
		 * Start playing the top song in the queue.
		 */
		async play() {
			let song = this.songs[0]
			await song.prepare()
			if (song.error) {
				this.textChannel.send(song.error)
				this._nextSong()
			} else {
				this.player.play(song.track)
				this.songStartTime = Date.now()
				this._startNPUpdates()
				this.sendNewNP()
			}
		}
		/**
		 * Start updating the now playing message.
		 */
		_startNPUpdates() {
			let frequency = this.songs[0].npUpdateFrequency
			let timeUntilNext5 = frequency - ((Date.now() - this.songStartTime) % frequency)
			let triggerNow = timeUntilNext5 > 1500
			//console.log(frequency, Date.now(), this.songStartTime, timeUntilNext5, triggerNow)
			this.npUpdater.start(frequency, triggerNow, timeUntilNext5)
		}
		/**
		 * Called when the player emits the "end" event.
		 * @param {LLEndEvent} event
		 */
		_onEnd(event) {
			if (event.reason == "REPLACED") return
			this._nextSong()
		}
		_nextSong() {
			if (this.songs.length <= 1) {
				this._dissolve()
			} else {
				this.songs.shift()
				this.play()
			}
		}
		/**
		 * Deconstruct the queue:
		 *
		 * Stop updating the now playing message.
		 * Leave the voice channel.
		 *
		 * You probably ought to make sure songs is empty and nothing is playing before calling.
		 */
		_dissolve() {
			this.npUpdater.stop(false)
			this.npMenu.destroy(true)
			client.lavalink.leave(this.guildID)
			this.store.delete(this.guildID)
		}
		/**
		 * Pause playback.
		 * @returns {String?} null on success, string reason on failure
		 */
		pause() {
			if (this.songs[0].noPauseReason) {
				return this.songs[0].noPauseReason
			} else {
				this.pausedAt = Date.now()
				this.player.pause()
				this.npUpdater.stop(true)
				return null
			}
		}
		/**
		 * Resume playback.
		 */
		resume() {
			let pausedTime = Date.now() - this.pausedAt
			this.songStartTime += pausedTime
			this.pausedAt = null
			this.player.resume().then(() => {
				this._startNPUpdates()
			})
		}
		/**
		 * Skip the current song by asking the player to stop.
		 */
		skip() {
			this.player.stop()
		}
		/**
		 * End playback by clearing the queue, then asking the player to stop.
		 */
		stop() {
			this.songs = []
			this.player.stop()
		}
		/**
		 * Add a song to the end of the queue.
		 * Returns 0 on ordinary success.
		 * Returns 1 if this made the queue non-empty and started playback.
		 * @param {Song} song
		 * @returns {0|1}
		 */
		addSong(song) {
			this.songs.push(song)
			if (this.songs.length == 1) {
				this.play()
				return 1
			} else {
				return 0
			}
		}
		/**
		 * Play something from the list of related items.
		 * Returns 0 on success.
		 * Returns 1 if the index is out of range.
		 * @param {Number} index Zero-based index.
		 * @returns {Promise<0|1>}
		 */
		async playRelated(index) {
			if (typeof(index) != "number" || isNaN(index) || index < 0 || Math.floor(index) != index) return 1
			let related = await this.songs[0].getRelated()
			let item = related[index]
			if (!item) return 1
			this.addSong(item)
			return 0
		}
		get time() {
			if (this.isPaused) return this.pausedAt - this.songStartTime
			else return Date.now() - this.songStartTime
		}
		get timeSeconds() {
			return Math.round(this.time / 1000)
		}
		get isPaused() {
			return !!this.pausedAt
		}
		getTotalLength() {
			return this.songs.reduce((acc, cur) => (acc + cur.lengthSeconds), 0)
		}
		/**
		 * Create and return an embed containing details about the current song.
		 */
		_buildNPEmbed() {
			let song = this.songs[0]
			return new Discord.MessageEmbed()
			.setDescription(`Now playing: **${song.title}**\n\n${song.getProgress(this.timeSeconds, this.isPaused)}`)
			.setColor(0x36393f)
		}
		/**
		 * Send a new now playing message and generate reactions on it. Destroy the previous reaction menu.
		 * This can be called internally and externally.
		 * @param {Boolean} force If false, don't create more NP messages. If true, force creation of a new one.
		 * @returns {Promise<void>}
		 */
		sendNewNP(force = false) {
			if (this.np && !force) {
				return Promise.resolve()
			} else {
				if (this.npMenu) this.npMenu.destroy(true)
				return this.textChannel.send(this._buildNPEmbed()).then(x => {
					this.np = x
					this.npMenu = this.np.reactionMenu([
						{emoji: "⏯", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
							if (!this.voiceChannel.members.has(user.id)) return;
							this.wrapper.togglePlaying("reaction")
						}},
						{emoji: "⏭", remove: "user", actionType: "js", actionData: (msg, emoji, user, messageReaction) => {
							if (!this.voiceChannel.members.has(user.id)) return;
							this.wrapper.skip("reaction")
						}},
						{emoji: "⏹", remove: "all", ignore: "total", actionType: "js", actionData: (msg, emoji, user) => {
							if (!this.voiceChannel.members.has(user.id)) return;
							this.wrapper.stop("reaction")
						}}
					])
				})
			}
		}
	}

	class QueueWrapper {
		/**
		 * @param {Queue} queue
		 */
		constructor(queue) {
			this.queue = queue
		}
		togglePlaying(context) {
			if (this.queue.isPaused) return this.queue.resume()
			else {
				let reason = this.queue.pause()
				if (reason) {
					if (context instanceof Structures.TextChannel) {
						context.send(reason)
					}
				}
			}
		}
		skip(context) {
			this.queue.skip()
		}
		stop(context) {
			this.queue.stop()
		}
		/**
		 * @param {Structures.TextChannel} channel
		 */
		async showRelated(channel) {
			if (!this.queue.songs[0]) return // failsafe. how did this happen? no idea. just do nothing.
			if (this.queue.songs[0].typeWhileGetRelated) channel.sendTyping()
			let content = await this.queue.songs[0].showRelated()
			channel.send(content)
		}
		/**
		 * Permitted contexts:
		 * - A message `&m rel p 1`. A reaction will be added, or an error message will be sent.
		 * @param {Number} index One-based index.
		 */
		async playRelated(index, context) {
			index--
			let result = await this.queue.playRelated(index)
			if (context instanceof Structures.Message) {
				if (result == 0) context.react("✅")
				else context.channel.send("The number you typed doesn't correspond to an item in the related list.")
			}
		}
	}

	class QueueStore {
		constructor() {
			/** @type {Map<string, Queue>} */
			this.store = new Map()
		}
		/**
		 * @param {String} guildID
		 */
		has(guildID) {
			return this.store.has(guildID)
		}
		get(guildID) {
			return this.store.get(guildID)
		}
		/**
		 * @param {Discord.VoiceChannel} voiceChannel
		 * @param {Structures.TextChannel} textChannel
		 */
		getOrCreate(voiceChannel, textChannel) {
			let guildID = voiceChannel.guild.id
			if (this.store.has(guildID)) return this.store.get(guildID)
			else return this.create(voiceChannel, textChannel)
		}
		/**
		 * @param {Discord.VoiceChannel} voiceChannel
		 * @param {Structures.TextChannel} textChannel
		 */
		create(voiceChannel, textChannel) {
			let guildID = voiceChannel.guild.id
			let instance = new Queue(this, voiceChannel, textChannel)
			this.store.set(guildID, instance)
			return instance
		}
		/**
		 * Remove a queue from the store
		 * @param {String} guildID
		 */
		delete(guildID) {
			this.store.delete(guildID)
		}
	}

	const queueStore = new QueueStore()

	/**
	 * Call /loadtracks on the first node using the passed identifier.
	 * @param {String} string
	 * @returns {Promise<any[]>}
	 */
	async function getTracks(string) {
		const node = client.lavalink.nodes.first()

		const params = new URLSearchParams()
		params.append("identifier", string)

		return rp({
			url: `http://${node.host}:${node.port}/loadtracks?${params.toString()}`,
			headers: {
				"Authorization": node.password
			},
			json: true
		}).then(data => {
			console.log("Resolved tracks: ", data.tracks)
			return data.tracks
		})
	}

	commands.assign({
		"lavalink": {
			usage: "<text>",
			description: "Lol k",
			aliases: ["lavalink", "ll"],
			category: "development",
			async process(msg, suffix) {
				if (msg.channel.type == "dm") return
				if (msg.member.voice && !msg.member.voice.channel) return msg.channel.send("You have to be in a voice channel")
				if (!msg.member.voice.channel.joinable) return msg.channel.send("I can't join that channel lol")
				if (!msg.member.voice.channel.speakable) return msg.channel.send("I can't speak in that channel lol")

				let args = suffix.split(" ")
				let search = suffix.slice(args[0].length + 1)
				if (args[0] == "play") {
					if (!search) return msg.channel.send("You gotta gimme something to play. Lmao")
					let result = await getTracks(search)
					if (result.length < 1) return msg.channel.send("Nothing found lol")
					let queue = queueStore.getOrCreate(msg.member.voice.channel, msg.channel)
					let song = makeYouTubeSongFromData(result[0])
					queue.addSong(song)
				} else if (args[0] == "frisky") {
					let result = await getTracks("http://chill.friskyradio.com/friskychill_mp3_high")
					let song = new FriskySong("chill", result[0])
					let queue = queueStore.getOrCreate(msg.member.voice.channel, msg.channel)
					queue.addSong(song)
				} else if (args[0] == "stop") {
					let queue = queueStore.get(msg.guild.id)
					if (queue) {
						queue.stop()
					} else {
						msg.channel.send("nothing playing lol")
					}
				} else if (args[0] == "queue") {
					let queue = queueStore.get(msg.guild.id)
					if (queue) {
						let rows = queue.songs.map((song, index) => `${index+1}. `+song.queueLine)
						let totalLength = "\nTotal length: "+common.prettySeconds(queue.getTotalLength())
						let body = utils.compactRows.removeMiddle(rows, 2000-totalLength.length).join("\n") + totalLength
						msg.channel.send(
							new Discord.MessageEmbed()
							.setTitle(`Queue for ${Discord.Util.escapeMarkdown(msg.guild.name)}`)
							.setDescription(body)
							.setColor(0x36393f)
						)
					} else {
						msg.channel.send("nothing playing lol")
					}
				} else if (args[0] == "n") {
					let queue = queueStore.get(msg.guild.id)
					if (queue) {
						queue.sendNewNP(true)
					} else {
						msg.channel.send("nothing playing lol")
					}
				} else if (args[0] == "related") {
					let queue = queueStore.get(msg.guild.id)
					if (queue) {
						if (args[1] == "play") {
							let index = +args[2]
							queue.wrapper.playRelated(index, msg)
						} else {
							queue.wrapper.showRelated(msg.channel)
						}
					} else {
						msg.channel.send("nothing playing lol")
					}
				} else if (args[0] == "test") {
					let queue = queueStore.getOrCreate(msg.member.voice.channel, msg.channel)
					let results = await Promise.all([
						getTracks("wN9bXy_fiOE"),
						getTracks("PSfBqZ46NmE"),
						getTracks("fa2pWQlajSQ")
					])
					results.forEach(result => {
						let song = makeYouTubeSongFromData(result[0])
						queue.addSong(song)
					})
				} else if (args[0] == "xi") {
					let songs = await utils.sql.all("SELECT * FROM PlaylistSongs INNER JOIN Songs ON Songs.videoID = PlaylistSongs.videoID WHERE playlistID = 1");
					let orderedSongs = [];
					let song = songs.find(row => !songs.some(r => r.next == row.videoID));
					while (song) {
						orderedSongs.push(song);
						if (song.next) song = songs.find(row => row.videoID == song.next);
						else song = null;
					}
					let queue = queueStore.getOrCreate(msg.member.voice.channel, msg.channel)
					for (let songInfo of orderedSongs) {
						let song = new YouTubeSong(songInfo.videoID, songInfo.name, songInfo.length)
						queue.addSong(song)
					}
				}
			}
		}
	})
}
