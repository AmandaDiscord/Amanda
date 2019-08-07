const ytdl = require("ytdl-core");
const YouTube = require('simple-youtube-api');
const net = require("net");
const crypto = require("crypto");
const rp = require("request-promise");
const Discord = require("discord.js");
const path = require("path");

//@ts-ignore
require("../../types.js");

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { config, client, reloadEvent, reloader, commands, queueManager, youtube } = passthrough;

	let utils = require("../../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);

	let songTypes = require("./songtypes.js")(passthrough)
	reloader.useSync("./commands/music/songtypes.js", songTypes)
	let Song = songTypes.YouTubeSong // intellisense sucks

	let queueFile = require("./queue.js")(passthrough)
	reloader.useSync("./commands/music/queue.js", queueFile)
	let Queue = queueFile.Queue // intellisense sucks

	let playlistCommand = require("./playlistcommand.js")(passthrough)
	reloader.useSync("./commands/music/playlistcommand.js", playlistCommand)

	let common = require("./common.js")(passthrough)
	reloader.useSync("./commands/music/common.js", common)

	utils.addTemporaryListener(client, "guildUpdate", path.basename(__filename), (a, b) => {
		/** @type {Queue} */
		let queue = queueManager.storage.get(b.id)
		if (a.region != b.region && queue) {
			queue.textChannel.send("The guild region changed, forcing me to disconnect from voice and stop playing music.")
			queue.stop()
		}
	})

	let bulkLoaders = [];

	/**
	 * @param {Song} song
	 * @param {Discord.TextChannel} textChannel
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Boolean} [insert]
	 * @param {Discord.Message} [context]
	 */
	function handleSong(song, textChannel, voiceChannel, insert = undefined, context) {
		let queue = queueManager.storage.get(textChannel.guild.id) || new queueFile.Queue(textChannel, voiceChannel);
		let numberOfSongs = queue.addSong(song, insert);
		if (context instanceof Discord.Message && numberOfSongs > 1) {
			context.react("✅")
		}
		return numberOfSongs
	}

	class VoiceStateCallback {
		/**
		 * @param {Discord.Snowflake} userID
		 * @param {Discord.Guild} guild
		 * @param {Number} timeoutMs
		 * @param {(voiceChannel: Discord.VoiceChannel) => void} callback
		 * @constructor
		 */
		constructor(userID, guild, timeoutMs, callback) {
			this.userID = userID;
			this.guild = guild;
			this.timeout = setTimeout(() => this.cancel(), timeoutMs);
			this.callback = callback;
			this.active = true;
			voiceStateCallbackManager.getAll(this.userID, this.guild).forEach(o => o.cancel());
			this.add();
		}
		add() {
			voiceStateCallbackManager.callbacks.push(this);
		}
		remove() {
			let index = voiceStateCallbackManager.callbacks.indexOf(this);
			if (index != -1) voiceStateCallbackManager.callbacks.splice(index, 1);
		}
		/**
		 * @param {Discord.VoiceChannel} voiceChannel
		 */
		trigger(voiceChannel) {
			if (this.active) {
				this.active = false;
				this.remove();
				this.callback(voiceChannel);
			}
		}
		cancel() {
			if (this.active) {
				this.active = false;
				this.remove();
				this.callback(null);
			}
		}
	}
	const voiceStateCallbackManager = {
		callbacks: [],
		/**
		 * @param {Discord.Snowflake} userID
		 * @param {Discord.Guild} guild
		 * @returns {Array<VoiceStateCallback>}
		 */
		getAll: function(userID, guild) {
			return this.callbacks.filter(o => o.userID == userID && o.guild == guild);
		}
	}
	/**
	 * @param {Discord.Snowflake} userID
	 * @param {Discord.Guild} guild
	 * @param {Number} timeoutMs
	 * @returns {Promise<Discord.VoiceChannel>}
	 */
	function getPromiseVoiceStateCallback(userID, guild, timeoutMs) {
		return new Promise(resolve => {
			new VoiceStateCallback(userID, guild, timeoutMs, voiceChannel => resolve(voiceChannel));
		});
	}

	utils.addTemporaryListener(client, "voiceStateUpdate", path.basename(__filename), (oldMember, newMember) => {
		// Process waiting to join
		if (newMember.id != client.user.id && newMember.voiceChannel) voiceStateCallbackManager.getAll(newMember.id, newMember.guild).forEach(state => state.trigger(newMember.voiceChannel))

		// Pass on to queue for leave timeouts
		let channel = oldMember.voiceChannel || newMember.voiceChannel;
		if (!channel || !channel.guild) return;
		let queue = queueManager.storage.get(channel.guild.id);
		if (queue) queue.voiceStateUpdate(oldMember, newMember);
	})
	
	utils.addTemporaryListener(reloadEvent, "music", path.basename(__filename), function(action) {
		if (action == "getQueues") {
			reloadEvent.emit("musicOut", "queues", queueManager.storage);
		} else if (action == "getQueue") {
			let serverID = [...arguments][1];
			if (!serverID) return;
			let queue = queueManager.storage.get(serverID);
			if (!queue) return;
			reloadEvent.emit("musicOut", "queue", queue);
		} else if (["skip", "stop", "pause", "resume"].includes(action)) {
			let [serverID, callback] = [...arguments].slice(1);
			let queue = queueManager.storage.get(serverID);
			if (!queue) return callback([400, "Server is not playing music"]);
			let result = queue[action](true);
			if (result[0]) callback([200, result[1]]);
			else callback([400, result[1]]);
		}
	});
	/**
	 * @param {Discord.Message} msg
	 * @param {Boolean} wait
	 * @returns {Promise<(Discord.VoiceChannel|null)>}
	 */
	async function detectVoiceChannel(msg, wait) {
		if (msg.member.voiceChannel) return msg.member.voiceChannel;
		if (!wait) return null;
		let voiceWaitMsg = await msg.channel.send(lang.voiceChannelWaiting(msg));
		return getPromiseVoiceStateCallback(msg.author.id, msg.guild, 30000);
	}

	const subcommandsMap = new Map([
		["play", {
			voiceChannel: "ask",
			code: async (msg, args, {voiceChannel}) => {
				if (!queueManager.storage.has(msg.guild.id)) {
					let permissions = voiceChannel.permissionsFor(client.user)
					if (!permissions.has("CONNECT")) return msg.channel.send(lang.permissionVoiceJoin());
					if (!permissions.has("SPEAK")) return msg.channel.send(lang.permissionVoiceSpeak());
				}
				if (!args[1]) return msg.channel.send(lang.input.music.playableRequired(msg));
				let result = await common.resolveInput.toIDWithSearch(args.slice(1).join(" "), msg.channel, msg.author.id);
				if (result == null) return;
				let usedSearch = result[1]
				result = result[0]
				result.forEach(item => {
					if (item instanceof YouTube.Video) {
						var song = new songTypes.YouTubeSong(item.id, undefined, true, {title: item.title, length_seconds: item.durationSeconds})
					} else {
						var song = new songTypes.YouTubeSong(item, undefined, true)
					}
					let numberOfSongs = handleSong(song, msg.channel, voiceChannel, args[0][0] == "i")
					if (numberOfSongs > 1 && !usedSearch) msg.react("✅")
				})
			}
		}],
		["stop", {
			voiceChannel: "required",
			queue: "required",
			code: async (msg, args, {queue}) => {
				let bulkLoaderIndex = -1;
				for (let i = 0; i < bulkLoaders.length; i++) {
					if (bulkLoaders[i][0] == msg.guild.id) bulkLoaderIndex = i;
				}
				if (bulkLoaderIndex != -1) {
					bulkLoaders[bulkLoaderIndex][1]();
				} else {
					if (!queue) {
						if (msg.guild.voiceConnection) return msg.guild.voiceConnection.channel.leave();
						else return msg.channel.send(lang.voiceNothingPlaying(msg));
					} else {
						queue.wrapper.stop()
					}
				}
			}
		}],
		["queue", {
			queue: "required",
			code: async (msg, args, {queue}) => {
				if (args[1] == "remove") {
					let index = +args[2]
					if (isNaN(index) || index != Math.floor(index) || index <= 1 || index > queue.songs.length) {
						return msg.channel.send("Syntax: `&music queue remove <position>`, where position is the number of the item in the queue")
					}
					index--
					let title = queue.songs[index].getTitle()
					queue.removeSong(index)
					msg.channel.send(lang.voiceQueueRemovedSong(title))
				} else {
					queue.wrapper.getQueue(msg)
				}
			}
		}],
		["skip", {
			voiceChannel: "required",
			queue: "required",
			code: async (msg, args, {queue}) => {
				queue.wrapper.skip(msg);
			}
		}],
		["auto", {
			voiceChannel: "required",
			queue: "required",
			code: async (msg, args, {queue}) => {
				queue.wrapper.toggleAuto(msg);
			}
		}],
		["now", {
			queue: "required",
			code: async (msg, args, {queue}) => {
				if (msg.channel == queue.textChannel) queue.sendNowPlaying();
				else msg.channel.send("The current music session is over in "+queue.textChannel+". Go there to see what's playing!")
			}
		}],
		["info", {
			queue: "required",
			code: async (msg, args, {queue}) => {
				queue.wrapper.showInfo();
			}
		}],
		["pause", {
			voiceChannel: "required",
			queue: "required",
			code: async (msg, args, {queue}) => {
				queue.wrapper.pause(msg);
			}
		}],
		["resume", {
			voiceChannel: "required",
			queue: "required",
			code: async (msg, args, {queue}) => {
				queue.wrapper.resume(msg);
			}
		}],
		["related", {
			voiceChannel: "required",
			queue: "required",
			code: async (msg, args, {voiceChannel, queue}) => {
				let mode = args[1];
				let index = parseInt(args[2]);
				if (mode && (mode[0] == "p" || mode[0] == "i") && index) {
					let related = await queue.songs[0].getRelated()
					let selection = related[index-1]
					if (!selection) return msg.channel.send("The syntax is `&music related <play|insert> <index>`. Your index was invalid.")
					let song = new songTypes.YouTubeSong(selection.id, undefined, true, selection)
					handleSong(song, msg.channel, voiceChannel, mode[0] == "i", msg)
				} else {
					let content = await queue.songs[0].showRelated()
					msg.channel.send(utils.contentify(msg.channel, content))
				}
			}
		}],
		["playlist", {
			voiceChannel: "provide",
			code: async (msg, args, {voiceChannel}) => {
				playlistCommand.command(msg, args, (songs) => {
					let isNewQueue = false
					songs.forEach((song, index) => {
						let numberOfSongs = handleSong(song, msg.channel, voiceChannel, false)
						if (index == 0 && numberOfSongs == 1) isNewQueue = true
					})
					if (isNewQueue) msg.react("✅")
				})
			}
		}]
	])
	const subcommandAliasMap = new Map()
	;[
		["play", ["p", "insert", "i"]],
		["queue", ["q"]],
		["skip", ["s"]],
		["now", ["n"]],
		["related", ["rel"]],
		["playlist", ["pl", "playlists"]]
	].forEach(entry => {
		entry[1].forEach(alias => {
			subcommandAliasMap.set(alias, entry[0])
		})
	})
	subcommandsMap.forEach((value, key) => {
		subcommandAliasMap.set(key, key)
	})

	commands.assign({
		"musictoken": {
			usage: "[new|delete]",
			description: "Obtain a web dashboard login token",
			aliases: ["token", "musictoken", "webtoken", "musictokens", "webtokens"],
			category: "meta",
			process: async function(msg, suffix) {
				if (suffix == "delete") {
					await deleteAll()
					msg.author.send("Deleted all your tokens. Use `&musictoken new` to generate a new one.")
				} else if (suffix == "new") {
					await deleteAll()
					let hash = crypto.randomBytes(24).toString("base64").replace(/\W/g, "_")
					await utils.sql.all("INSERT INTO WebTokens VALUES (?, ?, ?)", [msg.author.id, hash, 1]);
					send(
						`Your existing tokens were deleted, and a new one was created.`
						+"\n`"+hash+"`"
						+"\nDo not share this token with anyone. If you do accidentally share it, you can use `&musictoken delete` to delete it and keep you safe."
						+`\nYou can now log in! ${config.website_protocol}://${config.website_domain}/dash`
					)
				} else {
					let existing = await utils.sql.get("SELECT * FROM WebTokens WHERE userID = ?", msg.author.id)
					if (existing) {
						send(
							"Here is the token you generated previously:"
							+"\n`"+existing.token+"`"
							+"\nYou can use `&musictoken delete` to delete it, and `&musictoken new` to regenerate it."
						)
					} else {
						send("You do not currently have any tokens. Use `&musictoken new` to generate a new one.")
					}
				}
				
				function deleteAll() {
					return utils.sql.all("DELETE FROM WebTokens WHERE userID = ?", msg.author.id);
				}
				
				function send(text) {
					msg.author.send(text).then(() => {
						if (msg.channel.type == "text") msg.channel.send(`I sent you a DM.`)
					}).catch(() => {
						msg.channel.send(`Please allow me to send you DMs.`)
					})
				}
			}
		},
		"frisky": {
			usage: "[frisky|deep|chill]",
			description: "Frisky radio",
			aliases: ["frisky"],
			category: "music",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(lang.command.guildOnly(msg));
				const voiceChannel = msg.member.voiceChannel;
				if (!voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
				let station = ["frisky", "deep", "chill"].includes(suffix) ? suffix : "frisky";
				let stream = new songTypes.FriskySong(station);
				return handleSong(stream, msg.channel, voiceChannel);
			}
		},
		"music": {
			usage: "none",
			description: "You're not supposed to see this",
			aliases: ["music", "m"],
			category: "music",
			process: async function(msg, suffix) {
				// No DMs
				if (msg.channel.type != "text") return msg.channel.send(lang.command.guildOnly(msg))
				// Args
				let args = suffix.split(" ")
				// Find subcommand
				let subcommand = args[0] ? args[0].trim().toLowerCase() : ""
				let key = subcommandAliasMap.get(subcommand)
				let subcommandObject = subcommandsMap.get(key)
				if (!subcommandObject) return msg.channel.send(lang.input.music.invalidAction(msg))
				// Create data for subcommand
				let subcommmandData = {}
				// Provide a queue?
				if (subcommandObject.queue == "required") {
					let Queue = queueFile.Queue
					/** @type {Queue} */
					let queue = queueManager.storage.get(msg.guild.id)
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg))
					subcommmandData.queue = queue
				}
				// Provide a voice channel?
				if (subcommandObject.voiceChannel) {
					if (subcommandObject.voiceChannel == "required") {
						let voiceChannel = await detectVoiceChannel(msg, false)
						if (!voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg))
						subcommmandData.voiceChannel = voiceChannel
					} else if (subcommandObject.voiceChannel == "ask") {
						let voiceChannel = await detectVoiceChannel(msg, true)
						if (!voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg))
						subcommmandData.voiceChannel = voiceChannel
					} else if (subcommandObject.voiceChannel == "provide") {
						let voiceChannel = await detectVoiceChannel(msg, false)
						subcommmandData.voiceChannel = voiceChannel
					}
				}
				// Hand over execution to the subcommand
				subcommandObject.code(msg, args, subcommmandData)
			}
		}
	})
}
