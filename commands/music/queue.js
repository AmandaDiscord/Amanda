//@ts-ignore
require("../../types.js");

const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const rp = require("request-promise");
const events = require("events");
const lavalink = require("discord.js-lavalink")

const Structures = require("../../modules/structures");

const voiceEmptyDuration = 20000;

let queueFileCache;

function handleDispatcherError(error) {
	console.error(error);
}

/**
 * @typedef {Object} LLEndEvent
 * @property {String} guildId
 * @property {String} reason
 * @property {String} track
 * @property {"event"} op
 * @property {"TrackEndEvent"} type
 */

void 0 // prevent jsdoc fallthrough

/** @param {PassthroughType} passthrough */
module.exports = passthrough => {
	const {client, queueManager, reloader, reloadEvent, youtube} = passthrough

	let utils = require("../../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);

	let songTypes = require("./songtypes.js")(passthrough)
	let Song = songTypes.YouTubeSong // thanks jsdoc
	reloader.useSync("./commands/music/songtypes.js", songTypes)

	let common = require("./common.js")(passthrough)
	reloader.useSync("./commands/music/common.js", common)

	if (!queueFileCache) {
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
				this.voiceLeaveTimeout = null;
				this.voiceLeaveWarningMessagePromise = null;
				this.player = client.lavalink.join({
					guild: this.guildID,
					channel: this.voiceChannel.id,
					host: client.lavalink.nodes.first().host
				})
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
			 * @param {Number|Boolean} [insert]
			 * @returns {0|1}
			 */
			addSong(song, insert) {
				let position; // the actual position to insert into, `undefined` to push
				if (insert == undefined) { // no insert? just push
					position = -1;
				} else if (typeof(insert) == "number") { // number? insert into that point
					position = insert;
				} else if (typeof(insert) == "boolean") { // boolean?
					if (insert) position = 1; // if insert is true, insert
					else position = -1; // otherwise, push
				}
				if (position == -1) this.songs.push(song);
				else this.songs.splice(position, 0, song);
				if (this.songs.length == 1) {
					this.play()
					return 1
				} else {
					return 0
				}
			}
			removeSong(index) {
				if (index == 0) return 1
				if (!this.songs[index]) return 1
				let removed = this.songs.splice(index, 1)[0]
				if (!removed) return 2
				return 0
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
			/**
			 * @param {Discord.VoiceState} oldState
			 * @param {Discord.VoiceState} newState
			 */
			voiceStateUpdate(oldState, newState) {
				let count = this.voiceChannel.members.filter(m => !m.user.bot).size;
				if (count == 0) {
					if (!this.voiceLeaveTimeout.isActive) {
						this.voiceLeaveTimeout = new utils.BetterTimeout(() => {
							this.textChannel.send("Everyone left, so I have as well.");
							this._dissolve();
						}, voiceEmptyDuration);
						this.voiceLeaveWarningMessagePromise = this.textChannel.send("No users left in my voice channel. I will stop playing in "+voiceEmptyDuration/1000+" seconds if nobody rejoins.");
					}
				} else {
					this.voiceLeaveTimeout.clear();
					if (this.voiceLeaveWarningMessagePromise) {
						this.voiceLeaveWarningMessagePromise.then(msg => {
							msg.delete()
							delete this.voiceLeaveWarningMessagePromise
						})
					}
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
					else context.channel.send("The number you typed isn't an item in the related list. Try `&music related`.")
				}
			}
		}

		passthrough.queueStore = new QueueStore();

		var queueFile = {Queue, QueueWrapper, QueueStore}
		queueFileCache = queueFile
	} else {
		// @ts-ignore
		var queueFile = queueFileCache
	}

	return queueFile
}
