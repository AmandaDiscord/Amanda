//@ts-ignore
require("../../types.js")

const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const rp = require("request-promise");
const events = require("events")

const voiceEmptyDuration = 20000;

let queueFileCache;

function handleDispatcherError(error) {
	console.error(error);
}

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
		class Queue {
			/**
			 * @param {Discord.TextChannel} textChannel
			 * @param {Discord.VoiceChannel} voiceChannel
			 * @constructor
			 */
			constructor(textChannel, voiceChannel) {
				this.textChannel = textChannel
				this._voiceChannel = voiceChannel
				this.id = this.textChannel.guild.id
				this.connection = null
				/**
				 * @type {Discord.StreamDispatcher}
				 */
				this._dispatcher = null
				/**
				 * @type {Set<String>}
				 */
				this.playedSongs = new Set()
				/**
				 * @type {Array<Song>}
				 */
				this.songs = []
				this.playing = false
				this.skippable = false
				this.auto = false
				this.nowPlayingMsg = null
				this.wrapper = new queueFile.QueueWrapper(this)
				this.events = new events.EventEmitter()
				this.voiceLeaveTimeout = new utils.BetterTimeout()
				this.queueManager = queueManager
				this.queueManager.addQueue(this)
				voiceChannel.join().then(async connection => {
					this.connection = connection
					if (!this.songs.length) await this.textChannel.send(
						"AAAAAAAAA! You didn't give me any songs before I joined the channel!!!!! I'm going to break now."
					)
					await this.sendNowPlaying()
					this.play()
				});
			}
			/**
			 * @returns {Discord.VoiceChannel}
			 */
			get voiceChannel() {
				return this.connection ? this.connection.channel : this._voiceChannel;
			}
			/**
			 * @returns {Discord.StreamDispatcher}
			 */
			get dispatcher() {
				if (this.connection && this.connection.dispatcher) return this.connection.dispatcher
				else return this._dispatcher
			}
			/**
			 * Destroy the current song,
			 * delete all songs,
			 * stop the current song,
			 * leave the voice channel,
			 * delete the reaction menu,
			 * remove from storage
			 */
			dissolve() {
				if (this.songs[0] && this.songs[0].destroy) this.songs[0].destroy()
				this.stopNowPlayingUpdates()
				this.songs.length = 0;
				this.auto = false;
				this.voiceLeaveTimeout.clear();
				if (this.connection && this.connection.dispatcher) this.connection.dispatcher.end();
				if (this.voiceChannel) this.voiceChannel.leave();
				if (this.nowPlayingMsg) this.nowPlayingMsg.clearReactions();
				if (this.reactionMenu) this.reactionMenu.destroy(true);
				this.events.emit("dissolve")
				this.events.removeAllListeners()
				this.destroy();
			}
			/**
			 * Remove this queue from storage.
			 */
			destroy() {
				this.queueManager.storage.delete(this.id);
			}
			/**
			 * @param {Song} song
			 * @param {Boolean} insert
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
				this.events.emit("queueAdd", song, position)
				song.events.on("update", () => this.announceSongInfoUpdate(song))
				if (this.songs.length == 1) {
					if (this.connection) this.play();
				} else if (this.songs.length == 2) {
					song.prepare()
				} else {
					song.clean()
				}
				return this.songs.length
			}
			removeSong(index) {
				if (index == 0) return 1
				if (!this.songs[index]) return 1
				let removed = this.songs.splice(index, 1)[0]
				if (!removed) return 2
				removed.destroy()
				this.events.emit("queueRemove", index)
				return 0
			}
			/** @param {Song} song */
			announceSongInfoUpdate(song) {
				let index = this.songs.indexOf(song)
				if (index != -1) this.events.emit("songUpdate", index)
			}
			/**
			 * @param {Discord.GuildMember} oldMember
			 * @param {Discord.GuildMember} newMember
			 */
			voiceStateUpdate(oldMember, newMember) {
				let count = this.voiceChannel.members.filter(m => !m.user.bot).size;
				if (count == 0) {
					if (!this.voiceLeaveTimeout.isActive) {
						this.voiceLeaveTimeout = new utils.BetterTimeout(() => {
							this.textChannel.send("Everyone left, so I have as well.");
							this.dissolve();
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
			getNPEmbed() {
				let song = this.songs[0];
				let time = this.dispatcher ? this.dispatcher.time : 0
				let paused = this.dispatcher && this.dispatcher.paused
				let embed = new Discord.RichEmbed().setColor("36393E")
				.setDescription(`Now playing: **${song.getTitle()}**`)
				.addField("­", this.songs[0].getProgress(time, paused));
				if (!this.textChannel.permissionsFor(client.user).has("ADD_REACTIONS")) embed.addField("­", "Please give me permission to add reactions to use player controls!");
				return utils.contentify(this.textChannel, embed);
			}
			generateReactions() {
				if (this.reactionMenu) this.reactionMenu.destroy(true);
				if (this.nowPlayingMsg) this.reactionMenu = this.nowPlayingMsg.reactionMenu([
					{ emoji: "⏯", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
						if (!this.voiceChannel.members.has(user.id)) return;
						this.wrapper.togglePlaying("reaction")
					}},
					{ emoji: "⏭", remove: "user", actionType: "js", actionData: (msg, emoji, user, messageReaction) => {
						if (!this.voiceChannel.members.has(user.id)) return;
						this.wrapper.skip("reaction")
					}},
					{ emoji: "⏹", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
						if (!this.voiceChannel.members.has(user.id)) return;
						msg.clearReactions();
						this.wrapper.stop("reaction")
					}}
				]);
			}
			/**
			 * Deactivate the old now playing message and send a new one.
			 * This does not wait for the reactions to generate.
			 */
			async sendNowPlaying() {
				let embed = this.getNPEmbed()
				let newmessage = await this.textChannel.send(embed)
				if (this.nowPlayingMsg) this.nowPlayingMsg.clearReactions()
				this.nowPlayingMsg = newmessage
				this.generateReactions() // this also destroys the old menu. hooray for no leaks?
			}
			/**
			 * Update the existing now playing message once.
			 * Do not call this before the first Queue.play(), because the now playing message might not exist then.
			 */
			updateNowPlaying() {
				if (!this.nowPlayingMsg) throw new Error("I TOLD YOU SO!!!")
				if (this.songs[0]) return this.nowPlayingMsg.edit(this.getNPEmbed())
				else return Promise.resolve(null)
			}
			/**
			 * Immediately update the now playing message, and continue to update it every few seconds, as defined by the song.
			 */
			startNowPlayingUpdates() {
				this.updateNowPlaying()
				let timePastLastUpdate = this.dispatcher.time % this.songs[0].progressUpdateFrequency
				let timeUntilNextUpdate = this.songs[0].progressUpdateFrequency - timePastLastUpdate
				// Wait until the next multiple
				this.npUpdateTimeout = setTimeout(() => {
					this.updateNowPlaying()
					// Then continue to update from an interval
					this.npUpdateInterval = setInterval(() => {
						this.updateNowPlaying()
					}, this.songs[0].progressUpdateFrequency)
				}, timeUntilNextUpdate)
			}
			/**
			 * Prevent further updates of the now playing message.
			 */
			stopNowPlayingUpdates() {
				clearTimeout(this.npUpdateTimeout)
				clearInterval(this.npUpdateInterval)
			}
			/**
			 * @returns {Promise<void>} void
			 */
			async play() {
				// Set up song
				let song = this.songs[0]
				this.playedSongs.add(song.getUniqueID())
				song.queue = this
				// Prepare next song
				if (this.songs[1]) this.songs[1].prepare()
				// Get a stream
				let stream = await song.getStream()
				if (!stream) {
					this.textChannel.send(song.getError())
					return this.playNext()
				}
				stream.on("error", async err => {
					this.textChannel.send("Failed to stream that file. This is a bug. Please tell us about it. https://discord.gg/zhthQjH")
					console.error(err)
					stream.removeAllListeners("data")
					return this.playNext()
				});
				// Make a dispatcher
				/**
				 * @type {Discord.StreamDispatcher}
				 */
				stream.once("data", () => {
					const dispatcher = this.connection[song.connectionPlayFunction](stream, {bitrate: "auto"})
					this._dispatcher = dispatcher
					dispatcher.once("start", async () => {
						// Set up the internal state
						queueManager.songsPlayed++
						this.skippable = true
						this.playing = true
						this.startNowPlayingUpdates()
						// Emit for dash
						this.events.emit("timeUpdate")
						// Listen for errors
						dispatcher.on("error", handleDispatcherError)
						// Wait for the end
						dispatcher.once("end", () => {
							// Deconstruct everything
							this.playing = false
							this.skippable = false
							this.stopNowPlayingUpdates()
							this.updateNowPlaying()
							song.destroy()
							stream.removeAllListeners("error")
							dispatcher.removeListener("error", handleDispatcherError)
							// Reset the pausedTime
							dispatcher.player.streamingData.pausedTime = 0
							// Emit for dash
							this.events.emit("next")
							// Play the next song, or quit (auto is handled in here)
							this.playNext()
						})
					})
				})
			}
			playNext() {
				let justPlayed = this.songs.shift()
				if (this.songs[0]) {
					this.play()
				} else if (!this.auto) {
					this.dissolve()
				} else {
					justPlayed.getSuggested(this.playedSongs).then(song => {
						if (song) {
							let isQueueStillEmpty = !this.songs[0]
							this.songs.push(song)
							this.events.emit("queueAdd", song, -1)
							if (isQueueStillEmpty) this.play()
						} else {
							this.dissolve()
						}
					}).catch(() => {
						this.dissolve()
					})
				}
			}
			/**
			 * @returns {Number} Status code. 0 success, 1 already paused, 2 live
			 */
			pause() {
				if (!this.songs[0].canBePaused) {
					return 2
				} else if (!this.playing) {
					return 1
				} else if (this.connection && this.connection.dispatcher) {
					this.playing = false
					this.connection.dispatcher.pause()
					this.stopNowPlayingUpdates()
					this.updateNowPlaying()
					this.events.emit("timeUpdate")
					return 0
				} else {
					return -1
				}
			}
			/**
			 * @returns {Number} Status code. 0 success, 1 not paused
			 */
			resume() {
				if (this.playing) {
					return 1
				} else if (this.connection && this.connection.dispatcher) {
					this.playing = true
					this.connection.dispatcher.resume()
					this.startNowPlayingUpdates()
					this.events.emit("timeUpdate")
					return 0
				} else {
					return -1
				}
			}
			/**
			 * @returns {Number} Status code. 0 success, 1 paused
			 */
			skip() {
				if (!this.playing) {
					return 1
				} else if (this.connection && this.connection.dispatcher) {
					this.connection.dispatcher.end()
					return 0
				} else {
					return -1
				}
			}
			/**
			 * @returns {Number} Status code. 0 success
			 */
			stop() {
				this.dissolve()
				return 0
			}
		}

		class QueueWrapper {
			/** @param {Queue} queue */
			constructor(queue) {
				this.queue = queue;
			}

			async showInfo() {
				let info = this.queue.songs[0].getDetails()
				if (info instanceof Promise) {
					this.queue.textChannel.sendTyping()
					info = await info
				}
				this.queue.textChannel.send(utils.contentify(this.queue.textChannel, info))
			}

			pause(context) {
				let result = this.queue.pause()
				if (context instanceof Discord.Message || context === "reaction") {
					let channel = context.channel || this.queue.textChannel
					if (result == -1) {
						channel.send(lang.voiceCannotAction("paused"))
					} else if (result == 1) {
						channel.send("Music is already paused. To resume playback, use `&music resume`.")
					} else if (result == 2) {
						channel.send("You can't pause live music.")
					}
				}
			}

			resume(context) {
				let result = this.queue.resume()
				if (context instanceof Discord.Message || context === "reaction") {
					let channel = context.channel || this.queue.textChannel
					if (result == -1) {
						channel.send(lang.voiceCannotAction("resumed"))
					} else if (result == 1) {
						channel.send("Music's already playing. If you want to pause it, use `&music pause`.")
					}
				}
			}

			skip(context) {
				let result = this.queue.skip()
				if (context instanceof Discord.Message || context === "reaction") {
					let channel = context.channel || this.queue.textChannel
					if (result == -1) {
						channel.send(lang.voiceCannotAction("skipped"))
					} else if (result == 1) {
						channel.send("You can't skip if music is paused. Resume playback, then skip.")
					}
				}
			}

			stop(context) {
				let result = this.queue.stop()
				if (context instanceof Discord.Message || context === "reaction") {
					let channel = context.channel || this.queue.textChannel
					if (result == -1) {
						channel.send(lang.voiceCannotAction("stopped"))
					}
				}
			}

			toggleAuto(context) {
				this.queue.auto = !this.queue.auto
				if (context instanceof Discord.Message) {
					let mode = this.queue.auto ? "on" : "off"
					context.channel.send(`Auto mode is now turned ${mode}.`)
				}
			}

			togglePlaying(context) {
				if (this.queue.playing) return this.pause(context)
				else return this.resume(context)
			}

			getQueue(context) {
				if (context instanceof Discord.Message) {
					let rows = this.queue.songs.map((song, index) => `${index+1}. `+song.getQueueLine())
					let totalLength = "\nTotal length: "+common.prettySeconds(this.queue.songs.reduce((acc, cur) => (acc + cur.getLength()), 0))
					let body = utils.compactRows.removeMiddle(rows, 2000-totalLength.length).join("\n") + totalLength
					let embed = new Discord.RichEmbed()
					.setAuthor(`Queue for ${context.guild.name}`)
					.setDescription(body)
					.setColor("36393E")
					return context.channel.send(utils.contentify(context.channel, embed));
				}
			}

			getState() {
				return {
					playing: this.queue.playing,
					time: this.queue.dispatcher ? this.queue.dispatcher.time : 0,
					songs: this.queue.songs.map(s => s.webInfo()),
					members: this.queue.voiceChannel.members.map(m => ({
						id: m.id,
						name: m.displayName,
						avatar: m.user.sizedAvatarURL(64)
					})),
					voiceChannel: {
						id: this.queue.voiceChannel.id,
						name: this.queue.voiceChannel.name
					}
				}
			}
		}

		var queueFile = {Queue, QueueWrapper}
		queueFileCache = queueFile
	} else {
		var queueFile = queueFileCache
	}

	return queueFile
}
