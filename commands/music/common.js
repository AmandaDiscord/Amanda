//@ts-check

const rp = require("request-promise")
const Discord = require("discord.js")

const passthrough = require("../../passthrough")
let {client, reloader} = passthrough

let utils = require("../../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

let lang = require("../../modules/lang.js")
reloader.useSync("./modules/lang.js", lang)

let common = {
	/**
	 * @param {Discord.TextChannel|Discord.DMChannel} channel
	 * @param {Object} reason
	 * @param {String} reason.message
	 * @param {String} id
	 * @param {Number} item
	 * @returns {Promise<Discord.Message>}
	 */
	manageYtdlGetInfoErrors: function(channel, reason, id, item) {
		if (channel instanceof Discord.Message) channel = channel.channel;
		let idString = id ? ` (index: ${item}, id: ${id})` : "";
		if (!reason || !reason.message) {
			return channel.send("An unknown error occurred."+idString);
		} if (reason.message && reason.message.startsWith("No video id found:")) {
			return channel.send(`That is not a valid YouTube video.`+idString);
		} else if (reason.message && (
				reason.message.includes("who has blocked it in your country")
			|| reason.message.includes("This video is unavailable")
			|| reason.message.includes("The uploader has not made this video available in your country")
			|| reason.message.includes("copyright infringement")
		)) {
			return channel.send(`I'm not able to stream that video. It may have been deleted by the creator, made private, blocked in certain countries, or taken down for copyright infringement.`+idString);
		} else {
			return new Promise(resolve => {
				utils.stringify(reason).then(result => {
					channel.send(result).then(resolve);
				});
			});
		}
	},

	/**
	 * @param {Number} seconds
	 */
	prettySeconds: function(seconds) {
		let minutes = Math.floor(seconds / 60);
		seconds = seconds % 60;
		let hours = Math.floor(minutes / 60);
		minutes = minutes % 60;
		let output = [];
		if (hours) {
			output.push(hours);
			output.push(minutes.toString().padStart(2, "0"));
		} else {
			output.push(minutes);
		}
		output.push(seconds.toString().padStart(2, "0"));
		return output.join(":");
	},

	inputToID:
	/**
	 * @param {String} input
	 * @returns {({type: string, id?: string, list?: string})|null}
	 */
	function(input) {
		input = input.replace(/(<|>)/g, "")
		try {
			let inputAsURL = input
			if (inputAsURL.includes(".com/") && !inputAsURL.startsWith("http")) inputAsURL = "https://"+inputAsURL
			const url = new URL(inputAsURL)
			// It's a URL.
			if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4)
			// Is it CloudTube?
			if (url.hostname == "cadence.moe" || url.hostname == "cadence.gq") {
				try {
					const id = url.pathname.match(/video\/([\w-]{11})$/)[1]
					// Got an ID!
					return {type: "video", id: id}
				} catch (e) {
					// Didn't match.
					return null
				}
			}
			// Is it youtu.be?
			else if (url.hostname == "youtu.be") {
				const id = url.pathname.slice(1)
				return {type: "video", id: id}
			}
			// Is it YouTube-compatible?
			else if (url.hostname == "youtube.com" || url.hostname == "invidio.us" || url.hostname == "hooktube.com") {
				// Is it a playlist?
				if (url.searchParams.get("list")) {
					let result = {type: "playlist", list: url.searchParams.get("list")}
					const id = url.searchParams.get("v")
					if (id) result.id = id
					return result
				}
				// Is it a video?
				else if (url.pathname == "/watch") {
					const id = url.searchParams.get("v")
					// Got an ID!
					return {type: "video", id: id}
				}
				// YouTube-compatible, but can't resolve to a video.
				else {
					return null
				}
			}
			// Unknown site.
			else {
				return null
			}
		} catch (e) {
			// Not a URL. Might be an ID?
			if (input.length == 11) return {type: "video", id: input}
			else return null
		}
	},
	/**
	 * Call /loadtracks on the first node using the passed identifier.
	 * @param {String} input
	 * @returns {Promise<{track: String, info: {identifier: String, isSeekable: Boolean, author: String, length: Number, isStream: Boolean, position: Number, title: String, uri: String}}[]>}
	 */
	getTracks: async function(input) {
		const node = client.lavalink.nodes.first()

		const params = new URLSearchParams()
		params.append("identifier", input)

		return rp({
			url: `http://${node.host}:${node.port}/loadtracks?${params.toString()}`,
			headers: {
				"Authorization": node.password
			},
			json: true
		}).then(data => data.tracks)
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
		function(song, textChannel, voiceChannel, insert = false, context) {
			let queue = passthrough.queueStore.getOrCreate(voiceChannel, textChannel)
			let result = queue.addSong(song, insert)
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
			let song = songTypes.makeYouTubeSongFromData(data)
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
			let songs = data.map(item => songTypes.makeYouTubeSongFromData(item))
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
			let tracks = await common.getTracks("ytsearch:"+search)
			if (tracks.length == 0) return textChannel.send("No results.")
			tracks = tracks.slice(0, 10)
			let results = tracks.map((track, index) => `${index+1}. **${Discord.Util.escapeMarkdown(track.info.title)}** (${common.prettySeconds(track.info.length/1000)})`)
			utils.makeSelection(textChannel, author.id, "Song selection", "Song selection cancelled", results).then(index => {
				if (typeof(index) != "number") return
				let track = tracks[index]
				common.inserters.fromData(textChannel, voiceChannel, track, insert)
			})
		}
	}
}

module.exports = common
