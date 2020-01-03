// @ts-check

const rp = require("request-promise")
const Discord = require("discord.js")
const path = require("path")

const passthrough = require("../../passthrough")
const { client, reloader, config } = passthrough

const utils = require("../../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

class VoiceStateCallback {
	/**
	 * @param {Discord.Message} msg
	 * @param {number} timeoutMs
	 * @param {(voiceChannel: Discord.VoiceChannel) => any} callback
	 * @constructor
	 */
	constructor(msg, timeoutMs, callback) {
		this.msg = msg
		this.timeout = setTimeout(() => this.cancel(), timeoutMs)
		this.callback = callback
		this.active = true
		common.voiceStateCallbackManager.getAll(this.msg.author.id, this.msg.guild).forEach(o => o.cancel()) // this works? (common declared later)
		this.add()
	}
	add() {
		common.voiceStateCallbackManager.callbacks.push(this)
	}
	remove() {
		const index = common.voiceStateCallbackManager.callbacks.indexOf(this)
		if (index != -1) common.voiceStateCallbackManager.callbacks.splice(index, 1)
	}
	/**
	 * @param {Discord.VoiceChannel} voiceChannel
	 */
	async trigger(voiceChannel) {
		let lang
		const selflang = await utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID =? AND setting =?", [this.msg.author.id, "language"])
		if (selflang) lang = await utils.getLang(this.msg.author.id, "self")
		else if (this.msg.guild) lang = await utils.getLang(this.msg.guild.id, "guild")
		else lang = await utils.getLang(this.msg.author.id, "self")
		if (this.active) {
			const checkedVoiceChannel = common.verifyVoiceChannel(voiceChannel, this.msg, lang)
			if (checkedVoiceChannel) {
				// All good!
				this.active = false
				clearTimeout(this.timeout)
				this.remove()
				this.callback(voiceChannel)
			}
			// Else, couldn't join or speak. We'll keep this active in case they switch channels.
		}
	}
	cancel() {
		if (this.active) {
			this.active = false
			clearTimeout(this.timeout)
			this.remove()
			this.callback(null)
		}
	}
}

const common = {
	/**
	 * @param {number} seconds
	 */
	prettySeconds: function(seconds) {
		let minutes = Math.floor(seconds / 60)
		seconds = seconds % 60
		const hours = Math.floor(minutes / 60)
		minutes = minutes % 60
		const output = []
		if (hours) {
			output.push(hours)
			output.push(minutes.toString().padStart(2, "0"))
		} else {
			output.push(minutes)
		}
		output.push(seconds.toString().padStart(2, "0"))
		return output.join(":")
	},

	inputToID:
	/**
	 * @param {string} input
	 * @returns {({type: string, id?: string, list?: string})|null}
	 */
	function(input) {
		input = input.replace(/(<|>)/g, "")
		try {
			let inputAsURL = input
			if (inputAsURL.includes(".com/") && !inputAsURL.startsWith("http")) inputAsURL = `https://${inputAsURL}`
			const url = new URL(inputAsURL)
			// It's a URL.
			if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4)
			// Is it CloudTube?
			if (url.hostname == "cadence.moe" || url.hostname == "cadence.gq") {
				try {
					const id = url.pathname.match(/video\/([\w-]{11})$/)[1]
					// Got an ID!
					return { type: "video", id: id }
				} catch (e) {
					// Didn't match.
					return null
				}
			} else if (url.hostname == "youtu.be") { // Is it youtu.be?
				const id = url.pathname.slice(1)
				return { type: "video", id: id }
			} else if (url.hostname == "youtube.com" || url.hostname == "invidio.us" || url.hostname == "hooktube.com") { // Is it YouTube-compatible?
				// Is it a playlist?
				if (url.searchParams.get("list")) {
					const result = { type: "playlist", list: url.searchParams.get("list") }
					const id = url.searchParams.get("v")
					if (id) result.id = id
					return result
				} else if (url.pathname == "/watch") { // Is it a video?
					const id = url.searchParams.get("v")
					// Got an ID!
					return { type: "video", id: id }
				} else return null // YouTube-compatible, but can't resolve to a video.
			} else return null // Unknown site.
		} catch (e) {
			// Not a URL. Might be an ID?
			if (input.match(/^[A-Za-z0-9_-]{11}$/)) return { type: "video", id: input }
			else return null
		}
	},

	/**
	 * Call /loadtracks on the first node using the passed identifier.
	 * Throws exception.message.
	 * @param {string} input
	 * @returns {Promise<{track: string, info: {identifier: string, isSeekable: boolean, author: string, length: number, isStream: boolean, position: number, title: string, uri: string}}[]>}
	 */
	getTracks: function(input) {
		const node = client.lavalink.nodes.first()

		const params = new URLSearchParams()
		params.append("identifier", input)

		return rp({
			url: `http://${node.host}:${node.port}/loadtracks?${params.toString()}`,
			headers: {
				"Authorization": node.password
			},
			json: true
		}).then(data => {
			if (data.exception) throw data.exception.message
			else return data.tracks
		})
	},

	invidious: {
		/**
		 * Return a request promise. This is chained to reject if data.error is set.
		 * @param {string} id
		 */
		getData: function(id) {
			return rp(`${config.invidious_origin}/api/v1/videos/${id}`, { json: true }).then(data => {
				if (data.error) throw new Error(data.error)
				return data
			})
		},

		/**
		 * Find the best audio stream URL in a data object. Throw if the data is bad.
		 */
		dataToURL: function(data) {
			let formats = data && data.adaptiveFormats
			if (!formats || !formats[0]) throw new Error("This video has probably been deleted. (Invidious returned no formats.)")
			formats = formats
				.filter(f => f.type.includes("audio"))
				.sort((a, b) => (b.bitrate - a.bitrate))
			if (formats[0]) return formats[0].url
			throw new Error("Invidious did not return any audio formats. Sadly, we cannot play this song.")
		},

		/**
		 * Promise to get the track. Errors are rejected.
		 */
		urlToTrack: function(url) {
			if (!url) throw new Error("url parameter in urlToTrack is falsy")
			return common.getTracks(url).then(tracks => {
				if (!tracks || !tracks[0]) {
					console.error("Missing tracks from getTracks response")
					console.error(tracks)
					throw new Error("Missing tracks from getTracks response")
				} else {
					return tracks[0].track
				}
			})
		},

		/**
		 * Promise to get data to URL to track. Errors produced anywhere in the chain are rejected.
		 * @param {string} id
		 * @returns {Promise<string>}
		 */
		getTrack: function(id) {
			return common.invidious.getData(id)
				.then(common.invidious.dataToURL)
				.then(common.invidious.urlToTrack)
		}
	},

	inserters: {
		handleSong:
		/**
		 * @param {import("./songtypes").Song} song
		 * @param {Discord.TextChannel} textChannel
		 * @param {Discord.VoiceChannel} voiceChannel
		 * @param {boolean} insert
		 * @param {Discord.Message} [context]
		 */
		function(song, textChannel, voiceChannel, insert, context) {
			const queue = passthrough.queueStore.getOrCreate(voiceChannel, textChannel)
			const result = queue.addSong(song, insert)
			if (context instanceof Discord.Message && result == 0) {
				context.react("✅")
			}
		},

		fromData:
		/**
		 * @param {Discord.TextChannel} textChannel
		 * @param {Discord.VoiceChannel} voiceChannel
		 * @param {any} data
		 * @param {boolean} insert
		 * @param {Discord.Message} [context]
		 */
		function(textChannel, voiceChannel, data, insert, context) {
			const songTypes = require("./songtypes")
			const song = songTypes.makeYouTubeSongFromData(data)
			common.inserters.handleSong(song, textChannel, voiceChannel, insert, context)
		},


		fromDataArray:
		/**
		 * @param {Discord.TextChannel} textChannel
		 * @param {Discord.VoiceChannel} voiceChannel
		 * @param {any[]} data
		 * @param {boolean} insert
		 * @param {Discord.Message} [context]
		 */
		function(textChannel, voiceChannel, data, insert, context) {
			const songTypes = require("./songtypes")
			const songs = data.map(item => songTypes.makeYouTubeSongFromData(item))
			common.inserters.fromSongArray(textChannel, voiceChannel, songs, insert, context)
		},

		fromSongArray:
		/**
		 * @param {Discord.TextChannel} textChannel
		 * @param {Discord.VoiceChannel} voiceChannel
		 * @param {any[]} songs
		 * @param {boolean} insert
		 * @param {Discord.Message} [context]
		 */
		function(textChannel, voiceChannel, songs, insert, context) {
			if (insert) songs.reverse()
			songs.forEach(song => {
				common.inserters.handleSong(song, textChannel, voiceChannel, insert, context)
			})
		},

		fromSearch:
		/**
		 * @param {Discord.TextChannel} textChannel
		 * @param {Discord.VoiceChannel} voiceChannel
		 * @param {Discord.User} author
		 * @param {boolean} insert
		 * @param {string} search
		 */
		async function(textChannel, voiceChannel, author, insert, search) {
			let tracks = await common.getTracks(`ytsearch:${search}`)
			if (tracks.length == 0) return textChannel.send("No results.")
			tracks = tracks.slice(0, 10)
			const results = tracks.map((track, index) => `${index + 1}. **${Discord.Util.escapeMarkdown(track.info.title)}** (${common.prettySeconds(track.info.length / 1000)})`)
			utils.makeSelection(textChannel, author.id, "Song selection", "Song selection cancelled", results).then(index => {
				if (typeof index != "number") return
				const track = tracks[index]
				if (config.use_invidious) {
					const song = new (require("./songtypes").YouTubeSong)(track.info.identifier, track.info.title, Math.floor(track.info.length / 1000))
					common.inserters.handleSong(song, textChannel, voiceChannel, insert)
				} else {
					common.inserters.fromData(textChannel, voiceChannel, track, insert)
				}
			})
		}
	},

	voiceStateCallbackManager: {
		/**
		 * @type {VoiceStateCallback[]}
		 */
		callbacks: [],
		/**
		 * @param {string} userID
		 * @param {Discord.Guild} guild
		 * @returns {VoiceStateCallback[]}
		 */
		getAll: function(userID, guild) {
			return this.callbacks.filter(o => o.msg.author.id == userID && o.msg.guild == guild)
		}
	},

	VoiceStateCallback,

	/**
	 * @param {Discord.Message} msg
	 * @param {number} timeoutMs
	 * @returns {Promise<Discord.VoiceChannel>}
	 */
	getPromiseVoiceStateCallback: function(msg, timeoutMs) {
		return new Promise(resolve => {
			new common.VoiceStateCallback(msg, timeoutMs, voiceChannel => resolve(voiceChannel))
		})
	},

	/**
	 * Find the member that sent a message and get their voice channel.
	 * If `wait` is set, then wait 30 seconds for them to connect.
	 * Returns a promise that eventually resolves to a voice channel, or null (if they didn't join in time)
	 * **This responds to the user on failure, and also checks if the client has permission to join and speak.**
	 * @param {Discord.Message} msg
	 * @param {boolean} wait If false, return immediately. If true, wait up to 30 seconds for the member to connect.
	 * @param {import("@amanda/lang").Lang} lang
	 * @returns {Promise<(Discord.VoiceChannel|null)>}
	 */
	detectVoiceChannel: async function(msg, wait, lang) {
		// Already in a voice channel? Use that!
		if (msg.member.voice.channel) return common.verifyVoiceChannel(msg.member.voice.channel, msg, lang)
		// Not in a voice channel, and not waiting? Quit.
		if (!wait) {
			msg.channel.send(utils.replace(lang.audio.music.prompts.voiceChannelRequired, { "username": msg.author.username }))
			return null
		}
		// Tell the user to join.
		const prompt = await msg.channel.send(utils.replace(lang.audio.music.prompts.voiceChannelWaiting, { "username": msg.author.username }))
		// Return a promise which waits for them.
		return common.getPromiseVoiceStateCallback(msg, 30000).then(voiceChannel => {
			if (voiceChannel) {
				prompt.delete()
				return voiceChannel
			} else {
				prompt.edit(utils.replace(lang.audio.music.prompts.voiceChannelRequired, { "username": msg.author.username }))
				return null
			}
		})
	},

	/**
	 * Checks if the client can join and speak in the voice channel.
	 * If it can, return the voice channel.
	 * If it can't, send an error in chat and return null.
	 * @param {Discord.VoiceChannel} voiceChannel Voice channel to check
	 * @param {Discord.Message} msg Message to direct errors at
	 * @param {import("@amanda/lang").Lang} lang
	 * @return {(Discord.VoiceChannel|null)}
	 */
	verifyVoiceChannel: function(voiceChannel, msg, lang) {
		if (!voiceChannel.joinable) {
			msg.channel.send(utils.replace(lang.audio.music.prompts.voiceCantJoin, { "username": msg.author.username }))
			return null
		}
		if (!voiceChannel.speakable) {
			msg.channel.send(utils.replace(lang.audio.music.prompts.voiceCantSpeak, { "username": msg.author.username }))
			return null
		}
		// All good!
		return voiceChannel
	}
}

utils.addTemporaryListener(client, "voiceStateUpdate", path.basename(__filename), (oldState, newState) => {
	// Process waiting to join
	// If someone else changed state, and their new state has a channel (i.e. just joined or switched channel)
	if (newState.id != client.user.id && newState.channel) {
		// Trigger all callbacks for that user in that guild
		common.voiceStateCallbackManager.getAll(newState.id, newState.guild).forEach(state => state.trigger(newState.channel))
	}
})

module.exports = common
