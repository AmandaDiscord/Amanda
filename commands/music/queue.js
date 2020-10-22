// @ts-check

const Discord = require("thunderstorm")
const path = require("path")
const Lang = require("@amanda/lang")
const ReactionMenu = require("@amanda/reactionmenu")
const Util = require("discord.js/src/util/Util")

const passthrough = require("../../passthrough")
const { config, constants, client, reloader, ipc, internalEvents } = passthrough

/** @type {import("../../modules/managers/QueueManager")} */
let queues = passthrough.queues ? passthrough.queues : undefined

const voiceEmptyDuration = 20000

const utils = require("../../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

const common = require("./common.js")
reloader.sync("./commands/music/common.js", common)

utils.addTemporaryListener(internalEvents, "QueueManager", path.basename(__filename), (mngr) => {
	queues = mngr
	passthrough.queues = mngr
}, "once")

class FrequencyUpdater {
	/**
	 * @param {() => any} callback
	 */
	constructor(callback) {
		this.callback = callback
		this.timeout = null
		this.interval = null
	}
	/**
	 * @param {number} frequency Number of milliseconds between calls of the callback
	 * @param {boolean} trigger Whether to call the callback straight away
	 * @param {number} delay Defaults to frequency. Delay to be used for the the first delay only.
	 */
	start(frequency, trigger, delay = frequency) {
		this.stop(false)
		if (trigger) this.callback()
		this.timeout = setTimeout(() => {
			this.callback()
			this.interval = setInterval(() => {
				this.callback()
			}, frequency)
		}, delay)
	}
	stop(trigger = false) {
		clearTimeout(this.timeout)
		clearInterval(this.interval)
		if (trigger) this.callback()
	}
}

class Queue {
	/**
	 * @param {queues} manager
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Discord.Message["channel"]} textChannel
	 * @param {Discord.Guild} guild
	 * @param {string} [host]
	 */
	constructor(manager, voiceChannel, textChannel, guild, host = null) {
		this.manager = manager
		this.guild = guild
		this.voiceChannel = voiceChannel
		this.textChannel = textChannel
		this.wrapper = new QueueWrapper(this)
		/** @type {Map<string, Discord.GuildMember>} */
		this.listeners = new Map()
		this.songStartTime = 0
		this.pausedAt = null
		/** @type {import("./songtypes").Song[]} */
		this.songs = []
		/** @type {boolean} */
		this.auto = false
		this.loop = false
		this.errorChain = 0
		this.shouldDisplayErrors = true
		/** @type {import("@amanda/lang").Lang} */
		this.langCache = undefined
		this.audit = queues.audits.get(this.guild.id)

		this.voiceLeaveTimeout = new utils.BetterTimeout()
			.setCallback(() => {
				this.getLang().then(lang => this.textChannel.send(lang.audio.music.prompts.everyoneLeft))
				this.audit.push({ action: "Queue Destroy", platform: "System", user: "Amanda" })
				this.stop()
			})
			.setDelay(voiceEmptyDuration)

		this.voiceLeaveWarningMessagePromise = null
		if (!host) {
			const node = common.nodes.getByRegion(this.guild.region)
			host = node.id
		}
		this.nodeID = host
		this.player = client.lavalink.join({
			guild: this.guild.id,
			channel: this.voiceChannel.id,
			node: host
		})
		this.player.then(player => {
			player.on("end", event => this._onEnd(event))
			player.on("playerUpdate", async data => {
				const lang = await this.getLang()
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
								+ ` Region: ${guild.region}`
								+ `, guildID: ${this.guild.id}`
							)
							this.songs[0].error = lang.audio.music.prompts.songNotPlayingDiscord
						}
						console.log("Song error call A")
						this._reportError()
					}
				}
			})
			player.on("error", details => {
				if (details.type === "WebSocketClosedEvent") {
					// Caused when either voice channel deleted, or someone disconnected Amanda through context menu
					// Simply respond by stopping the queue, since that was the intention.
					// This should therefore clean up the queueStore and the website correctly.
					this.audit.push({ action: "Queue Destroy (Error Occurred)", platform: "System", user: "Amanda" })
					return this.stop()
				}
				console.error("Lavalink error event at", new Date().toUTCString(), details)
				if (this.songs[0]) {
					this.songs[0].error = details.error ? details.error : `\`\`\`js\n${JSON.stringify(details, null, 4)}\n\`\`\``
					console.log("Song error call B")
					this._reportError()
					// This may automatically continue to the next song, presumably because the end event may also be fired.
				}
			})
		})
		/** @type {Discord.Message} */
		this.np = null
		/** @type {import("@amanda/reactionmenu")} */
		this.npMenu = null
		this.npUpdater = new FrequencyUpdater(() => {
			if (this.np) {
				const embed = this._buildNPEmbed()
				if (embed) this.np.edit(embed)
			}
		})
		this.getLang().then(lng => this.langCache = lng)
	}
	getLang() {
		if (this.langCache) return Promise.resolve(this.langCache)
		return utils.getLang(this.guild.id, "guild")
	}
	toObject() {
		return {
			guild: this.guild.toJSON(),
			voiceChannelID: this.voiceChannel.id,
			textChannelID: this.textChannel.id,
			songStartTime: this.songStartTime,
			pausedAt: this.pausedAt,
			npID: this.np ? this.np.id : null,
			songs: this.songs.map(s => s.toObject()),
			host: this.nodeID
		}
	}
	/**
	 * Start playing the top song in the queue.
	 */
	async play() {
		const lang = await this.getLang()
		const song = this.songs[0]
		if (this.songs[1]) this.songs[1].prepare()
		await song.prepare()
		if (!song.error) {
			if (song.track == "!") song.error = lang.audio.music.prompts.songErrorExclaimation
			else if (song.track == null) song.error = lang.audio.music.prompts.songErrorNull
		}
		if (song.error) {
			console.error("Song error call C:")
			console.error("id:", song.id, "/ error:", song.error)
			this._reportError()
			this._nextSong()
		} else {
			passthrough.periodicHistory.add("song_start")
			const player = await this.player
			player.play(song.track).then(() => {
				this.songStartTime = Date.now()
				this.pausedAt = null
				this._startNPUpdates()
				this.sendNewNP()
			})
		}
	}
	async _reportError() {
		const lang = await this.getLang()
		const sendReport = (contents) => {
			// Report to original channel
			this.textChannel.send(contents)
			// Report to #amanda-error-log
			const reportTarget = "512869106089852949"
			const embed = new Discord.MessageEmbed()
			embed.setTitle("Music error occurred.")
			embed.setDescription("The next message is the message that was sent to the user.")
			const nodeID = this.nodeID
			const node = common.nodes.getByID(nodeID)
			const details = [
				["Cluster", config.cluster_id],
				["Guild", this.guild.name],
				["Guild ID", this.guild.id],
				["Text channel", this.textChannel.id],
				["Voice channel", this.voiceChannel.id],
				["Using Invidious", String(config.use_invidious)],
				["Invidious origin", `\`${common.invidious.getOrigin(this.nodeID)}\``],
				["Queue node", node ? node.name : "Unnamed"]
			]
			const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
			const detailsString = details.map(row =>
				`\`${row[0]}${" ​".repeat(maxLength - row[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
			).join("\n")
			embed.addField(
				"Details",
				detailsString
			)
			embed.setColor(0xff2ee7)
			const rchan = new Discord.PartialChannel({ id: reportTarget }, client)
			rchan.send(embed).then(() => {
				return rchan.send(contents)
			// eslint-disable-next-line no-empty-function
			}).catch(() => {}) // probably missing access error
		}
		this.errorChain++
		if (this.shouldDisplayErrors) {
			const song = this.songs[0]
			if (song) {
				const embed = new Discord.MessageEmbed()
					.setTitle(lang.audio.music.prompts.songNotPlayable)
					.setDescription(
						`**${Util.escapeMarkdown(song.title)}** (ID: ${song.id})`
					+ `\n${song.error}`
					)
					.setColor(0xdd2d2d)
				sendReport(embed)
			} else {
				const embed = new Discord.MessageEmbed()
					.setTitle(lang.audio.music.prompts.errorOccured)
					.setDescription(utils.replace(lang.audio.music.prompts.songErrorNotObject, { "song": song }))
					.setColor(0xdd2d2d)
				sendReport(embed)
			}
			if (this.errorChain >= 3) {
				this.shouldDisplayErrors = false
				this.textChannel.send(
					await utils.contentify(
						this.textChannel,
						new Discord.MessageEmbed()
							.setTitle(lang.audio.music.prompts.tooManyErrors)
							.setDescription(lang.audio.music.prompts.errorsSuppressed)
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
		if (!this.songs[0]) return console.log("Tried to call Queue._startNPUpdates but no songs")
		const frequency = this.songs[0].npUpdateFrequency
		const timeUntilNext5 = frequency - ((Date.now() - this.songStartTime) % frequency)
		const triggerNow = timeUntilNext5 > 1500
		// console.log(frequency, Date.now(), this.songStartTime, timeUntilNext5, triggerNow)
		this.npUpdater.start(frequency, triggerNow, timeUntilNext5)
	}
	/**
	 * Called when the player emits the "end" event.
	 * @param {import("lavacord").LavalinkEvent} event
	 */
	_onEnd(event) {
		if (event.reason == "REPLACED") return
		this._nextSong()
	}
	async _nextSong() {
		const lang = await this.getLang()
		// Special case for loop 1
		if (this.songs.length === 1 && this.loop && !this.songs[0].error) {
			this.play()
			return
		}

		// Destroy current song (if loop is disabled)
		if (this.songs[0] && (!this.loop || this.songs[0].error)) this.songs[0].destroy()
		// Out of songs? (This should only pass if loop mode is also disabled.)
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
					this.textChannel.send(lang.audio.music.prompts.autoRanOut)
					this.auto = false
					this.audit.push({ action: "Queue Destroy", platform: "System", user: "Amanda" })
					this._clearSongs()
					this._dissolve()
				}
			} else { // Auto mode is off. Dissolve.
				this.audit.push({ action: "Queue Destroy", platform: "System", user: "Amanda" })
				this._clearSongs()
				this._dissolve()
			}
		} else { // We have more songs. Move on.
			const removed = this.songs.shift()
			ipc.replier.sendNextSong(this)
			// In loop mode, add the just played song back to the end of the queue.
			if (this.loop && !removed.error) {
				this.addSong(removed)
			}
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
		if (this.npMenu) this.npMenu.destroy(true, "text")
		client.lavalink.leave(this.guild.id)
		this.manager.delete(this.guild.id)
	}
	/**
	 * Pause playback.
	 * @returns {Promise<?string>} null on success, string reason on failure
	 */
	async pause() {
		if (this.songs[0].noPauseReason) return this.songs[0].noPauseReason
		else if (this.isPaused) {
			if (this.langCache) return this.langCache.audio.music.prompts.queueAlreadyPaused
			else return "Music is already paused. Use `&music resume` to resume."
		} else {
			const player = await this.player
			this.pausedAt = Date.now()
			player.pause(true)
			this.npUpdater.stop(true)
			ipc.replier.sendTimeUpdate(this)
			return null
		}
	}
	/**
	 * Resume playback.
	 * Returns 0 on success.
	 * Returns 1 if the queue wasn't paused.
	 * @returns {Promise<0|1>}
	 */
	async resume() {
		if (!this.isPaused) return 1
		else {
			const player = await this.player
			const pausedTime = Date.now() - this.pausedAt
			this.songStartTime += pausedTime
			this.pausedAt = null
			player.resume().then(() => {
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
	async skip(amount) {
		if (amount) {
			for (let i = 1; i <= amount - 1; i++) { // count from 1 to amount-1, inclusive
				this.removeSong(1, true)
			}
		}
		const player = await this.player
		player.stop()
	}
	/**
	 * End playback by clearing the queue, then asking the player to stop.
	 */
	async stop() {
		const player = await this.player
		this._clearSongs()
		this.loop = false
		this.auto = false
		player.stop()
		this._dissolve()
	}
	toggleAuto() {
		this.auto = !this.auto
		ipc.replier.sendAttributesChange(this)
	}
	toggleLoop() {
		this.loop = !this.loop
		ipc.replier.sendAttributesChange(this)
	}
	/**
	 * Add a song to the end of the queue.
	 * Returns 0 on ordinary success.
	 * Returns 1 if this made the queue non-empty and started playback.
	 * @param {import("./songtypes").Song} song
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
			const embed = new Discord.MessageEmbed()
			const lang = this.langCache || Lang.en_us
			embed.setDescription(utils.replace(lang.audio.music.prompts.queueNowPlaying, { "song": `**${Util.escapeMarkdown(song.title)}**\n\n${song.getProgress(this.timeSeconds, this.isPaused)}` }))
			embed.setColor(constants.standard_embed_color)
			return embed
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
			const result = this._buildNPEmbed()
			return this.textChannel.send(result ? result : `You found a bug. There were no songs in the queue when the now playing message was told to send. If a song is currently playing, try \`&now\` to fix it. Please report this bug here: <${constants.server}>. Or don't ¯\\\\\\_(ツ)\\_/¯`).then(x => {
				this.np = x
				this._makeReactionMenu()
			})
		}
	}
	_makeReactionMenu() {
		if (this.npMenu) this.npMenu.destroy(true, "text")
		this.npMenu = new ReactionMenu(this.np, client, [
			{ emoji: "⏯", remove: "user", actionType: "js", actionData: async (msg, emoji, user) => {
				const t = await client.rain.cache.voiceState.get(user.id, this.guild.id)
				if (!t) return
				const bO = t.boundObject ? t.boundObject : t
				if (bO.channel_id != this.voiceChannel.id) return
				this.audit.push({ action: this.isPaused ? "Queue Resume" : "Queue Pause", platform: "Discord", user: user.tag })
				this.wrapper.togglePlaying("reaction")
			} },
			{ emoji: "⏭", remove: "user", actionType: "js", actionData: async (msg, emoji, user) => {
				const t = await client.rain.cache.voiceState.get(user.id, this.guild.id)
				if (!t) return
				const bO = t.boundObject ? t.boundObject : t
				if (bO.channel_id != this.voiceChannel.id) return
				this.audit.push({ action: "Queue Skip", platform: "Discord", user: user.tag })
				this.wrapper.skip()
			} },
			{ emoji: "⏹", remove: "user", actionType: "js", actionData: async (msg, emoji, user) => {
				const t = await client.rain.cache.voiceState.get(user.id, this.guild.id)
				if (!t) return
				const bO = t.boundObject ? t.boundObject : t
				if (bO.channel_id != this.voiceChannel.id) return
				this.audit.push({ action: "Queue Destroy", platform: "Discord", user: user.tag })
				this.wrapper.stop()
			} }
		])
	}
	/**
	 * @param {Discord.VoiceState} newState
	 */
	async voiceStateUpdate(newState) {
		const lang = await this.getLang()
		// Update own channel
		if (newState.id == client.user.id && newState.channelID) {
			// @ts-ignore
			this.voiceChannel = await utils.cacheManager.channels.get(newState.channelID, true, true)
		}
		// Detect number of users left in channel
		/** @type {Array<any>} */
		const inGuild = (await passthrough.workers.cache.getData({ op: "FILTER_VOICE_STATES", params: { guild_id: newState.guildID } })) || []
		const count = inGuild.filter(item => item.channel_id === this.voiceChannel.id && item.user && !item.user.bot)
		if ((count && typeof count === "number" && count == 0) || (count && Array.isArray(count) && count.length == 0) || !count) {
			if (!this.voiceLeaveTimeout.isActive) {
				this.voiceLeaveTimeout.run()
				this.voiceLeaveWarningMessagePromise = this.textChannel.send(utils.replace(lang.audio.music.prompts.noUsersLeft, { "time": this.voiceLeaveTimeout.delay / 1000 }))
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
		if (context instanceof Discord.Message) {
			this.queue.getLang().then(lang => {
				context.channel.send(auto ? lang.audio.music.prompts.autoOn : lang.audio.music.prompts.autoOff)
			})
			this.queue.audit.push({ action: "Queue Auto Toggle", platform: "Discord", user: context.author.tag })
		} else if (context === "web") {
			this.queue.audit.push({ action: "Queue Auto Toggle", platform: "Web", user: "Unkown" })
			return true
		}
	}
	toggleLoop(context) {
		this.queue.toggleLoop()
		const loop = this.queue.loop
		if (context instanceof Discord.Message) {
			this.queue.getLang().then(lang => {
				context.channel.send(loop ? lang.audio.music.prompts.loopOn : lang.audio.music.prompts.loopOff)
			})
			this.queue.audit.push({ action: "Queue Loop Toggle", platform: "Discord", user: context.author.tag })
		} else if (context === "web") {
			this.queue.audit.push({ action: "Queue Loop Toggle", platform: "Web", user: "Unkown" })
			return true
		}
	}
	togglePlaying(context) {
		if (this.queue.isPaused) return this.resume(context)
		else return this.pause(context)
	}
	async pause(context) {
		const result = await this.queue.pause()
		if (context === "web") {
			if (!result) this.queue.audit.push({ action: "Queue Pause", platform: "Web", user: "Unkown" })
			return !result
		}
		if (context instanceof Discord.Message && !result) this.queue.audit.push({ action: "Queue Pause", platform: "Discord", user: context.author.tag })
		if (result) {
			if (context instanceof Discord.Message) context.channel.send(result)
			else if (context === "reaction") this.queue.textChannel.send(result)
		}
	}
	async resume(context) {
		const result = await this.queue.resume()
		if (context instanceof Discord.Message && result == 0) this.queue.audit.push({ action: "Queue Resume", platform: "Discord", user: context.author.tag })
		if (result == 1) {
			if (context instanceof Discord.Message) {
				this.queue.getLang().then(lang => {
					context.channel.send(lang.audio.music.prompts.musicPlaying)
				})
			}
		}
		if (context === "web") {
			if (result == 0) this.queue.audit.push({ action: "Queue Resume", platform: "Web", user: "Unkown" })
			return !result
		}
	}
	/**
	 * @param {number} [amount]
	 */
	skip(amount) {
		this.queue.skip(amount)
	}
	stop() {
		this.queue.stop()
	}
	/**
	 * @param {Discord.Message["channel"]} channel
	 */
	async showRelated(channel) {
		if (!this.queue.songs[0]) return // failsafe. how did this happen? no idea. just do nothing.
		if (this.queue.songs[0].typeWhileGetRelated) await channel.sendTyping()
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
		if (context instanceof Discord.Message) {
			this.queue.getLang().then(lang => {
				if (!index) {
					context.channel.send(lang.audio.music.prompts.songRemoveRequired)
				} else {
					const result = this.queue.removeSong(index - 1, true)
					if (result === 1) {
						if (index === 1) {
							context.channel.send(lang.audio.music.prompts.songRemove1)
						} else {
							context.channel.send(utils.replace(lang.audio.music.prompts.queueSongTotal, { "number1": this.queue.songs.length, "number2": this.queue.songs.length }))
						}
					} else {
						this.queue.audit.push({ action: "Queue Song Remove", platform: "Discord", user: context.author.tag })
						context.react("✅")
					}
				}
			})
		} else if (context === "web") {
			if (!index) {
				return false
			} else {
				const result = this.queue.removeSong(index - 1, true)
				if (result == 0) this.queue.audit.push({ action: "Queue Song Remove", platform: "Web", user: "Unknown" })
				return result !== 1
			}
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
	 * @param {Discord.Message["channel"]} channel
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
		const lang = await this.queue.getLang()
		index--
		const result = await this.queue.playRelated(index, insert)
		if (context instanceof Discord.Message) {
			if (result == 0) context.react("✅")
			else if (result == 1) context.channel.send(lang.audio.music.prompts.numberNotInRelated)
		}
	}

	getMembers() {
		return [...this.queue.listeners.values()].map(m => ({
			id: m.id,
			name: m.displayName,
			avatar: m.user.displayAvatarURL({ format: "png", size: 64, dynamic: false }),
			isAmanda: m.id == client.user.id
		}))
	}

	getAttributes() {
		return {
			auto: this.queue.auto,
			loop: this.queue.loop
		}
	}

	getState() {
		return {
			guildID: this.queue.guild.id,
			playing: !this.queue.isPaused,
			songStartTime: this.queue.songStartTime,
			pausedAt: this.queue.pausedAt,
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
