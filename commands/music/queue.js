// @ts-check

const Discord = require("discord.js")

const passthrough = require("../../passthrough")
const { config, client, reloader, queueStore, ipc } = passthrough

const voiceEmptyDuration = 20000

const utils = require("../../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

const songTypes = require("./songtypes.js")
reloader.useSync("./commands/music/songtypes.js", songTypes)

const common = require("./common.js")
reloader.useSync("./commands/music/common.js", common)

class Queue {
	/**
	 * @param {queueStore} store
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Discord.TextChannel} textChannel
	 */
	constructor(store, voiceChannel, textChannel) {
		this.store = store
		this.guildID = voiceChannel.guild.id
		this.voiceChannel = voiceChannel
		this.textChannel = textChannel
		this.wrapper = new QueueWrapper(this)
		this.songStartTime = 0
		this.pausedAt = null
		/** @type {songTypes.Song[]} */
		this.songs = []
		/** @type {boolean} */
		this.auto = false
		this.errorChain = 0
		this.shouldDisplayErrors = true

		this.voiceLeaveTimeout = new utils.BetterTimeout()
			.setCallback(() => {
				this.textChannel.send("Everyone left, so I have as well.")
				this.stop()
			})
			.setDelay(voiceEmptyDuration)

		this.voiceLeaveWarningMessagePromise = null
		this.player = client.lavalink.join({
			guild: this.guildID,
			channel: this.voiceChannel.id,
			host: client.lavalink.nodes.first().host
		})
		this.player.on("end", event => this._onEnd(event))
		this.player.on("playerUpdate", data => {
			if (!this.isPaused) {
				const newSongStartTime = data.state.time - data.state.position
				// commenting this out: it may break the error check, but it will improve the web time
				// if (Math.abs(newSongStartTime - this.songStartTime) > 100 && data.state.position !== 0) {
				this.songStartTime = newSongStartTime
				ipc.replier.sendTimeUpdate(this)
				// }
				if (newSongStartTime > this.songStartTime + 3500 && data.state.position === 0) {
					if (!this.songs[0].error) {
						console.log(
							"Song didn't start."
							+ ` Region: ${client.guilds.cache.get(this.guildID) ? client.guilds.cache.get(this.guildID).region : "unknown"}`
							+ `, guildID: ${this.guildID}`
						)
						this.songs[0].error =
							"Hmm. Seems like the song isn't playing."
							+ "\n\n**This is probably an issue with Discord.**"
							+ "\nYou should try changing the server region."
							+ "\n\nTo report a problem, join our server: https://discord.gg/YMkZDsK"
						this._reportError()
					}
				}
			}
		})
		this.player.on("error", exception => {
			if (this.songs[0] && !this.songs[0].error) {
				this.songs[0].error = exception.error
				this._reportError()
				// This already automatically continues to the next song, presumably because the "end" event is also fired.
			} else console.error(exception)
		})
		/** @type {Discord.Message} */
		this.np = null
		/** @type {import("../../modules/managers/Discord/ReactionMenu")} */
		this.npMenu = null
		this.npUpdater = new utils.FrequencyUpdater(() => {
			if (this.np) {
				const embed = this._buildNPEmbed()
				if (embed) this.np.edit(embed)
			}
		})
	}
	toObject() {
		return {
			guildID: this.guildID,
			voiceChannelID: this.voiceChannel.id,
			textChannelID: this.textChannel.id,
			songStartTime: this.songStartTime,
			pausedAt: this.pausedAt,
			npID: this.np ? this.np.id : null,
			songs: this.songs.map(s => s.toObject())
		}
	}
	/**
	 * Start playing the top song in the queue.
	 */
	async play() {
		const song = this.songs[0]
		if (this.songs[1]) this.songs[1].prepare()
		await song.prepare()
		if (!song.error) {
			if (song.track == "!") song.error = "`song.track` is ! placeholder. This is a bug."
			else if (song.track == null) song.error = "`song.track` is null or undefined. This is a bug."
		}
		if (song.error) {
			this._reportError()
			this._nextSong()
		} else {
			passthrough.periodicHistory.add("song_start")
			this.player.play(song.track).then(() => {
				this.songStartTime = Date.now()
				this.pausedAt = null
				this._startNPUpdates()
				this.sendNewNP()
			})
		}
	}
	_reportError() {
		const sendReport = (contents) => {
			// Report to original channel
			this.textChannel.send(contents)
			// Report to #amanda-error-log
			const reportTarget = "512869106089852949"
			const embed = new Discord.MessageEmbed()
			embed.setTitle("Music error occurred.")
			embed.setDescription("The next message is the message that was sent to the user.")
			const details = [
				["Shard", String(utils.getFirstShard())],
				["Guild", client.guilds.cache.get(this.guildID).name],
				["Guild ID", this.guildID],
				["Text channel", this.textChannel.id],
				["Voice channel", this.voiceChannel.id],
				["Using Invidious", String(config.use_invidious)],
				["Invidious origin", "`" + config.invidious_origin + "`"]
			]
			const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
			const detailsString = details.map(row =>
				"`" + row[0] + " ​".repeat(maxLength - row[0].length) + "` " + row[1] // SC: space + zwsp, wide space
			).join("\n")
			embed.addField(
				"Details",
				detailsString
			)
			embed.setColor(0xff2ee7)
			utils.sendToUncachedChannel(reportTarget, true, embed).then(() => {
				return utils.sendToUncachedChannel(reportTarget, true, contents)
			}).catch(() => {}) // probably missing access error
		}
		this.errorChain++
		if (this.shouldDisplayErrors) {
			const song = this.songs[0]
			if (song) {
				const embed = new Discord.MessageEmbed()
					.setTitle("We couldn't play that song")
					.setDescription(
						`**${song.title}** (ID: ${song.id})`
					+ `\n${song.error}`
					)
					.setColor(0xdd2d2d)
				sendReport(embed)
			} else {
				const embed = new Discord.MessageEmbed()
					.setTitle("We ran into an error")
					.setDescription(`Song is not an object: ${song}`)
					.setColor(0xdd2d2d)
				sendReport(embed)
			}
			if (this.errorChain >= 3) {
				this.shouldDisplayErrors = false
				this.textChannel.send(
					utils.contentify(
						this.textChannel,
						new Discord.MessageEmbed()
							.setTitle("Too many errors!")
							.setDescription(
								"Future errors from this queue will be silenced."
								+ "\nIf any more songs fail, they will be skipped with no message."
								+ "\nTo report a bug, join our server: https://discord.gg/YMkZDsK")
							.setColor(0xff2ee7)
					)
				)
			}
		}
	}
	/**
	 * Start updating the now playing message.
	 */
	_startNPUpdates() {
		const frequency = this.songs[0].npUpdateFrequency
		const timeUntilNext5 = frequency - ((Date.now() - this.songStartTime) % frequency)
		const triggerNow = timeUntilNext5 > 1500
		// console.log(frequency, Date.now(), this.songStartTime, timeUntilNext5, triggerNow)
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
	async _nextSong() {
		// Destroy current song
		if (this.songs[0]) this.songs[0].destroy()
		// Out of songs?
		if (this.songs.length <= 1) {
			// Is auto mode on?
			if (this.auto) {
				// Store the current song
				const lastPlayed = this.songs[0]
				// Get related
				const related = await lastPlayed.getRelated()
				// Can we play a related song?
				if (related.length) {
					this.songs.shift()
					this.addSong(related[0])
					ipc.replier.sendNextSong(this)
				} else { // No related songs. Dissolve.
					this.textChannel.send("Auto mode is on, but we ran out of related songs and had to stop playback.")
					this.auto = false
					this._clearSongs()
					this._dissolve()
				}
			} else { // Auto mode is off. Dissolve.
				this._clearSongs()
				this._dissolve()
			}
		} else { // We have more songs. Move on.
			this.songs.shift()
			ipc.replier.sendNextSong(this)
			this.play()
		}
	}
	_clearSongs() {
		this.songs.forEach(song => {
			song.destroy()
		})
		this.songs = []
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
		if (this.dissolved) return
		this.dissolved = true
		this.npUpdater.stop(false)
		if (this.npMenu) this.npMenu.destroy(true)
		client.lavalink.leave(this.guildID)
		this.store.delete(this.guildID)
	}
	/**
	 * Pause playback.
	 * @returns {String?} null on success, string reason on failure
	 */
	pause() {
		if (this.songs[0].noPauseReason) return this.songs[0].noPauseReason
		else if (this.isPaused) return "Music is already paused. Use `&music resume` to resume."
		else {
			this.pausedAt = Date.now()
			this.player.pause(true)
			this.npUpdater.stop(true)
			ipc.replier.sendTimeUpdate(this)
			return null
		}
	}
	/**
	 * Resume playback.
	 * Returns 0 on success.
	 * Returns 1 if the queue wasn't paused.
	 * @returns {0|1}
	 */
	resume() {
		if (!this.isPaused) return 1
		else {
			const pausedTime = Date.now() - this.pausedAt
			this.songStartTime += pausedTime
			this.pausedAt = null
			this.player.resume().then(() => {
				this._startNPUpdates()
			})
			ipc.replier.sendTimeUpdate(this)
			return 0
		}
	}
	/**
	 * Skip the current song by asking the player to stop.
	 * @param {number} [amount]
	 */
	skip(amount) {
		if (amount) {
			for (let i = 1; i <= amount - 1; i++) { // count from 1 to amount-1, inclusive
				this.removeSong(1, true)
			}
		}
		this.player.stop()
	}
	/**
	 * End playback by clearing the queue, then asking the player to stop.
	 */
	stop() {
		this._clearSongs()
		this.auto = false
		this.player.stop()
		this._dissolve()
	}
	toggleAuto() {
		this.auto = !this.auto
		ipc.replier.sendAttributesChange(this)
	}
	/**
	 * Add a song to the end of the queue.
	 * Returns 0 on ordinary success.
	 * Returns 1 if this made the queue non-empty and started playback.
	 * @param {songTypes.Song} song
	 * @param {number|boolean} [insert]
	 * @returns {0|1}
	 */
	addSong(song, insert) {
		let position // the actual position to insert into, `undefined` to push
		if (insert == undefined) { // no insert? just push
			position = -1
		} else if (typeof (insert) == "number") { // number? insert into that point
			position = insert
		} else if (typeof (insert) == "boolean") { // boolean?
			if (insert) position = 1 // if insert is true, insert
			else position = -1 // otherwise, push
		}
		song.queue = this
		if (position == -1) this.songs.push(song)
		else this.songs.splice(position, 0, song)
		ipc.replier.sendAddSong(this, song, position)
		if (this.songs.length == 2) song.prepare()
		if (this.songs.length == 1) {
			this.play()
			return 1
		} else return 0
	}
	/**
	 * Returns 0 on success.
	 * Returns 1 if the index is out of range.
	 * Returns 2 if index exists, but removed item was undefined.
	 * @param {number} index Zero-based index.
	 * @param {boolean} broadcast Whether to send a WS event for this removal
	 */
	removeSong(index, broadcast) {
		// Validate index
		if (index == 0) return 1
		if (!this.songs[index]) return 1
		// Broadcast
		if (broadcast) ipc.replier.sendRemoveSong(this, index)
		// Actually remove
		const removed = this.songs.splice(index, 1)[0]
		if (!removed) return 2
		removed.destroy()
		return 0
	}
	/**
	 * Remove all songs from the queue except for the currently playing one.
	 * @returns {number} Number of removed items.
	 */
	removeAllSongs() {
		const removed = this.songs.splice(1)
		for (const item of removed) {
			item.destroy()
		}
		ipc.replier.sendRemoveAllSongs(this)
		return removed.length
	}
	/**
	 * Play something from the list of related items.
	 * Returns 0 on success.
	 * Returns 1 if the index is out of range.
	 * @param {number} index Zero-based index.
	 * @param {boolean} insert
	 * @returns {Promise<0|1>}
	 */
	async playRelated(index, insert) {
		if (typeof index != "number" || isNaN(index) || index < 0 || Math.floor(index) != index) return 1
		const related = await this.songs[0].getRelated()
		const item = related[index]
		if (!item) return 1
		this.addSong(item, insert)
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
	 *	Returns null if no songs.
	 */
	_buildNPEmbed() {
		const song = this.songs[0]
		if (song) {
			return new Discord.MessageEmbed()
				.setDescription(`Now playing: **${song.title}**\n\n${song.getProgress(this.timeSeconds, this.isPaused)}`)
				.setColor(0x36393f)
		} else return null
	}
	/**
	 * Send a new now playing message and generate reactions on it. Destroy the previous reaction menu.
	 * This can be called internally and externally.
	 * @param {boolean} force If false, don't create more NP messages. If true, force creation of a new one.
	 * @returns {Promise<void>}
	 */
	sendNewNP(force = false) {
		if (this.np && !force) return Promise.resolve()
		else {
			return this.textChannel.send(this._buildNPEmbed()).then(x => {
				this.np = x
				this._makeReactionMenu()
			})
		}
	}
	_makeReactionMenu() {
		if (this.npMenu) this.npMenu.destroy(true)
		this.npMenu = utils.reactionMenu(this.np, [
			{ emoji: "⏯", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
				if (!this.voiceChannel.members.has(user.id)) return
				this.wrapper.togglePlaying("reaction")
			} },
			{ emoji: "⏭", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
				if (!this.voiceChannel.members.has(user.id)) return
				this.wrapper.skip()
			} },
			{ emoji: "⏹", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
				if (!this.voiceChannel.members.has(user.id)) return
				this.wrapper.stop()
			} }
		])
	}
	/**
	 * @param {Discord.VoiceState} oldState
	 * @param {Discord.VoiceState} newState
	 */
	voiceStateUpdate(oldState, newState) {
		// Update own channel
		if (newState.member.id == client.user.id && newState.channelID != oldState.channelID && newState.channel) this.voiceChannel = newState.channel
		// Detect number of users left in channel
		const count = this.voiceChannel.members.filter(m => !m.user.bot).size
		if (count == 0) {
			if (!this.voiceLeaveTimeout.isActive) {
				this.voiceLeaveTimeout.run()
				this.voiceLeaveWarningMessagePromise = this.textChannel.send(`No users left in my voice channel. I will stop playing in ${this.voiceLeaveTimeout.delay / 1000} seconds if nobody rejoins.`)
			}
		} else {
			this.voiceLeaveTimeout.clear()
			if (this.voiceLeaveWarningMessagePromise) {
				this.voiceLeaveWarningMessagePromise.then(msg => {
					msg.delete()
					this.voiceLeaveWarningMessagePromise = null
				})
			}
		}
		// Broadcast to web
		ipc.replier.sendMembersUpdate(this)
	}
}

class QueueWrapper {
	/**
	 * @param {Queue} queue
	 */
	constructor(queue) {
		this.queue = queue
	}
	toggleAuto(context) {
		this.queue.toggleAuto()
		const auto = this.queue.auto
		if (context instanceof Discord.Message) context.channel.send(`Auto mode is now turned ${auto ? "on" : "off"}`)
		else if (context === "web") return true
	}
	togglePlaying(context) {
		if (this.queue.isPaused) return this.resume(context)
		else return this.pause(context)
	}
	pause(context) {
		const result = this.queue.pause()
		if (context === "web") return !result
		if (result) {
			if (context instanceof Discord.Message) context.channel.send(result)
			else if (context === "reaction") this.queue.textChannel.send(result)
		}
	}
	resume(context) {
		const result = this.queue.resume()
		if (result == 1) if (context instanceof Discord.Message) context.channel.send("Music is playing. If you want to pause, use `&music pause`.")
		if (context === "web") return !result
	}
	skip(amount) {
		this.queue.skip(amount)
	}
	stop() {
		this.queue.stop()
	}
	/**
	 * @param {Discord.TextChannel} channel
	 */
	async showRelated(channel) {
		if (!this.queue.songs[0]) return // failsafe. how did this happen? no idea. just do nothing.
		if (this.queue.songs[0].typeWhileGetRelated) channel.sendTyping()
		const content = await this.queue.songs[0].showRelated()
		channel.send(content)
	}
	/**
	 * Permitted contexts:
	 * - A message `&m q remove 2`. A reaction will be added, or an error message will be sent.
	 * - The string "web". The return value will be a boolean indicating success.
	 * @param {number} index One-based index.
	 * @param {any} [context]
	 */
	removeSong(index, context) {
		if (!index || isNaN(index)) {
			if (context instanceof Discord.Message) {
				context.channel.send(
					"You need to tell me which song to remove. `&music queue remove <number>`"
					+ "\nTo clear the entire queue, use `&music queue clear` or `&music queue remove all`."
				)
			} else if (context === "web") return false
		} else {
			const result = this.queue.removeSong(index - 1, true)
			if (context instanceof Discord.Message) {
				if (result == 1) {
					if (index == 1) {
						context.channel.send(
							"Item 1 is the currently playing song. Use `&music skip` to skip it, "
							+ "or `&music queue remove 2` if you wanted to remove the song that's up next."
						)
					} else context.channel.send(`There are ${this.queue.songs.length} items in the queue. You can only remove items 2-${this.queue.songs.length}.`)
				} else context.react("✅")
			} else if (context === "web") return result !== 1
		}
	}
	/**
	 * Remove all songs from the queue except for the currently playing one.
	 */
	removeAllSongs(context) {
		const numberOfSongs = this.queue.removeAllSongs()
		if (context && context.msg && context.msg instanceof Discord.Message) {
			context.msg.channel.send(
				utils.replace(context.lang.audio.music.returns.queueClear, {
					"number": `${numberOfSongs} ${numberOfSongs === 1 ? "song" : "songs"}`
				})
			)
		} else if (context === "web") {
			return true
		}
	}
	/**
	 * @param {Discord.TextChannel} channel
	 */
	async showInfo(channel) {
		const content = await this.queue.songs[0].showInfo()
		channel.send(content)
	}
	/**
	 * Permitted contexts:
	 * - A message `&m rel p 1`. A reaction will be added, or an error message will be sent.
	 * @param {number} index One-based index.
	 * @param {boolean} insert
	 * @param {any} [context]
	 */
	async playRelated(index, insert, context) {
		index--
		const result = await this.queue.playRelated(index, insert)
		if (context instanceof Discord.Message) {
			if (result == 0) context.react("✅")
			else if (result == 1) context.channel.send("The number you typed isn't an item in the related list. Try `&music related`.")
		}
	}

	getMembers() {
		return this.queue.voiceChannel.members.map(m => ({
			id: m.id,
			name: m.displayName,
			avatar: m.user.displayAvatarURL({ format: "png", size: 64 }),
			isAmanda: m.id == client.user.id
		}))
	}

	getAttributes() {
		return {
			auto: this.queue.auto
		}
	}

	getState() {
		return {
			guildID: this.queue.guildID,
			playing: !this.queue.isPaused,
			songStartTime: this.queue.songStartTime,
			songs: this.queue.songs.map(s => s.getState()),
			members: this.getMembers(),
			voiceChannel: {
				id: this.queue.voiceChannel.id,
				name: this.queue.voiceChannel.name
			},
			attributes: this.getAttributes()
		}
	}
}

module.exports.Queue = Queue
module.exports.QueueWrapper = QueueWrapper

/**
 * @typedef {Object} LLEndEvent
 * @property {string} guildId
 * @property {string} reason
 * @property {string} track
 * @property {"event"} op
 * @property {"TrackEndEvent"} type
 */
