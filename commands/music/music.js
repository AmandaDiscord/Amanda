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
	let Song = songTypes.Song // intellisense sucks

	let queueFile = require("./queue.js")(passthrough)
	reloader.useSync("./commands/music/queue.js", queueFile)

	let playlistCommand = require("./playlistcommand.js")(passthrough)
	reloader.useSync("./commands/music/playlistcommand.js", playlistCommand)

	let common = require("./common.js")(passthrough)
	reloader.useSync("./commands/music/common.js", common)

	/**
	 * @param {Song} song
	 * @param {Discord.TextChannel} textChannel
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Boolean} insert
	 */
	async function handleSong(song, textChannel, voiceChannel, insert = undefined) {
		let queue = queueManager.storage.get(textChannel.guild.id) || new queueFile.Queue(textChannel, voiceChannel);
		queue.addSong(song, insert);
	}
	/**
	 * @param {Discord.Message} msg
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Array<String>} videoIDs
	 * @param {String} startString
	 * @param {String} endString
	 * @param {Boolean} shuffle
	 * @returns {Promise}
	 */
	async function bulkPlaySongs(msg, voiceChannel, videoIDs, startString, endString, shuffle = false) {
		const useBatchLimit = 50;
		const batchSize = 30;

		let oldVideoIDs = videoIDs;
		let from = startString == "-" ? 1 : (parseInt(startString) || 1);
		let to = endString == "-" ? videoIDs.length : (parseInt(endString) || from || videoIDs.length);
		from = Math.max(from, 1);
		to = Math.min(videoIDs.length, to);
		if (startString) videoIDs = videoIDs.slice(from-1, to);
		if (shuffle) {
			videoIDs = videoIDs.shuffle();
		}
		if (!startString && !shuffle) videoIDs = videoIDs.slice(); // copy array to leave oldVideoIDs intact after making batches
		if (!voiceChannel) voiceChannel = await detectVoiceChannel(msg, true);
		if (!voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
		let progress = 0;
		let total = videoIDs.length;
		let lastEdit = 0;
		let editInProgress = false;
		let progressMessage = await msg.channel.send(getProgressMessage());
		let batches = [];
		if (total <= useBatchLimit) batches.push(videoIDs);
		else while (videoIDs.length) batches.push(videoIDs.splice(0, batchSize));
		function getProgressMessage(batchNumber, batchProgress, batchTotal) {
			if (!batchNumber) return `Please wait, loading songs...`;
			else return `Please wait, loading songs (batch ${batchNumber}: ${batchProgress}/${batchTotal}, total: ${progress}/${total})`;
		}
		let videos = [];
		let batchNumber = 0;
		(function nextBatch() {
			let batch = batches.shift();
			batchNumber++;
			let batchProgress = 0;
			let promise = Promise.all(batch.map(videoID => {
				return ytdl.getInfo(videoID).then(info => {
					if (progress >= 0) {
						progress++;
						batchProgress++;
						if ((Date.now()-lastEdit > 2000 && !editInProgress) || progress == total) {
							lastEdit = Date.now();
							editInProgress = true;
							progressMessage.edit(getProgressMessage(batchNumber, batchProgress, batch.length)).then(() => {
								editInProgress = false;
							});
						}
						return info;
					}
				}).catch(reason => Promise.reject({reason, id: videoID}))
			}));
			promise.catch(error => {
				progress = -1;
				manageYtdlGetInfoErrors(msg, error.reason, error.id, oldVideoIDs.indexOf(error.id)+1).then(() => {
					msg.channel.send("At least one video in the playlist was not playable. Playlist loading has been cancelled.");
				});
			});
			promise.then(batchVideos => {
				videos.push(...batchVideos);
				if (batches.length) nextBatch();
				else {
					videos.forEach(video => {
						let queue = queueManager.storage.get(msg.guild.id);
						let song = new songTypes.YouTubeSong(video, !queue || queue.songs.length <= 1);
						handleSong(song, msg.channel, voiceChannel);
					});
				}
			});
		})();
	}

	/**
	 * @param {Discord.TextChannel} channel
	 * @param {Object} reason
	 * @param {String} reason.message
	 * @param {String} id
	 * @param {Number} item
	 * @returns {Promise<Discord.Message>}
	 */
	function manageYtdlGetInfoErrors(channel, reason, id, item) {
		if (channel.channel) channel = channel.channel;
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
	}

	class VoiceStateCallback {
		/**
		 * @param {Discord.Snowflake} userID
		 * @param {Discord.Guild} guild
		 * @param {Number} timeoutMs
		 * @param {Function} callback
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
	 */
	function getPromiseVoiceStateCallback(userID, guild, timeoutMs) {
		return new Promise(resolve => {
			new VoiceStateCallback(userID, guild, timeoutMs, voiceChannel => resolve(voiceChannel));
		});
	}

	utils.addTemporaryListener(client, "voiceStateUpdate", path.basename(__filename), (oldMember, newMember) => {
		// Ignore self
		if (newMember.id == client.user.id) return;

		// Process waiting to join
		if (newMember.voiceChannel) voiceStateCallbackManager.getAll(newMember.id, newMember.guild).forEach(state => state.trigger(newMember.voiceChannel))

		// Process leave timeout
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

	Object.assign(commands, {
		"musictoken": {
			usage: "none",
			description: "Assign a login token for use on Amanda's web dashboard",
			aliases: ["token", "musictoken", "webtoken"],
			category: "music",
			/**
			 * @param {Discord.Message} msg
			 */
			process: async function(msg) {
				return msg.channel.send(
					"The music controls website is currently under construction. "
					+"Check back again later, or join the support server to get an announcement as soon as it's available: https://discord.gg/zhthQjH"
				);
				if (msg.channel.type == "text") return msg.channel.send(`Please use this command in a DM.`);
				await utils.sql.all("DELETE FROM WebTokens WHERE userID = ?", msg.author.id);
				let hash = crypto.randomBytes(24).toString("base64").replace(/\W/g, "_")
				await utils.sql.all("INSERT INTO WebTokens VALUES (?, ?)", [msg.author.id, hash]);
				msg.channel.send(
					`Music login token created!\n`+
					"`"+hash+"`\n"+
					`Anyone who gets access to this token can control Amanda's music playback in any of your servers and can edit or delete any of your playlists.\n`+
					`**Keep it secret!**\n`+
					`(Unless you wish to collaborate on a playlist with a trusted person, in which case make sure that you *really* trust them.)\n`+
					`If you think somebody unscrupulous has gotten hold of this token, you can use this command again at any time to generate a new token and disable all previous ones.\n\n`+
					`You can find the music dashboard at ${config.website_protocol}://${config.website_domain}/dash.`);
			}
		},
		"frisky": {
			usage: "[frisky|deep|chill]",
			description: "Frisky radio",
			aliases: ["frisky"],
			category: "music",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
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
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function(msg, suffix) {
				if (msg.channel.type != "text") return msg.channel.send(lang.command.guildOnly(msg));
				let allowed = (await Promise.all([utils.hasPermission(msg.author, "music"), utils.hasPermission(msg.guild, "music")])).includes(true);
				if (!allowed) {
					let owner = await client.fetchUser("320067006521147393")
					return msg.channel.send(`${msg.author.username}, you or this guild is not part of the partner system. Information can be obtained by DMing ${owner.tag}`);
				}
				let args = suffix.split(" ");
				let queue = queueManager.storage.get(msg.guild.id);
				const allowedSubcommands = ["q", "queue", "n", "now", "pl", "playlist", "playlists"];
				let voiceChannel = await detectVoiceChannel(msg, !allowedSubcommands.includes(args[0].toLowerCase()));
				if (!voiceChannel && !allowedSubcommands.includes(args[0].toLowerCase())) {
					msg.channel.send(lang.voiceMustJoin(msg));
					return;
				}
				if (args[0].toLowerCase() == "play" || args[0].toLowerCase() == "insert" || args[0].toLowerCase() == "p" || args[0].toLowerCase() == "i") {
					if (!voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(lang.permissionVoiceJoin());
					if (!permissions.has("SPEAK")) return msg.channel.send(lang.permissionVoiceSpeak());
					if (!args[1]) return msg.channel.send(lang.input.music.playableRequired(msg));
					let result = await queueFile.searchYoutube(args.slice(1).join(" "), msg, args[1]);
					if (result == null) return;
					if (result.constructor.name == "Array") bulkPlaySongs(msg, voiceChannel, result.map(video => video.id), args[2], args[3]);
					else return handleSong(result, msg.channel, voiceChannel, args[0][0] == "i");
				} else if (args[0].toLowerCase() == "stop") {
					if (!msg.member.voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
					if (!queue) {
						if (msg.guild.voiceConnection) return msg.guild.voiceConnection.channel.leave();
						else return msg.channel.send(lang.voiceNothingPlaying(msg));
					}
					if (queue.stop(queue)[0]) return;
				} else if (args[0].toLowerCase() == "queue" || args[0].toLowerCase() == "q") {
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg));
					let totalLength = "\nTotal length: "+common.prettySeconds(queue.songs.reduce((p,c) => (p+parseInt(c.source == "YouTube" ? c.basic.length_seconds : 0)), 0)); //TODO: move this to the song object
					let body = queue.songs.map((songss, index) => `${index+1}. **${songss.title}** (${common.prettySeconds(songss.source == "YouTube" ? songss.basic.length_seconds: "LIVE")})`).join('\n');
					if (body.length > 2000) {
						let first = body.slice(0, 995-totalLength.length/2).split("\n").slice(0, -1).join("\n");
						let last = body.slice(totalLength.length/2-995).split("\n").slice(1).join("\n");
						body = first+"\n…\n"+last;
					}
					let embed = new Discord.RichEmbed()
					.setAuthor(`Queue for ${msg.guild.name}`)
					.setDescription(body+totalLength)
					.setColor("36393E")
					return msg.channel.send({embed});
				} else if (args[0].toLowerCase() == "skip" || args[0].toLowerCase() == "s") {
					if (!msg.member.voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg));
					if (queue.skip()[0]) return;
				} else if (args[0].toLowerCase() == "auto") {
					if (!msg.member.voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg));
					queue.auto = !queue.auto;
					return msg.channel.send(`Auto mode is now turned ${queue.auto ? "on" : "off"}`);
				} else if (args[0].toLowerCase() == "now" || args[0].toLowerCase() == "n" || args[0].toLowerCase() == "np") {
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg));
					let embed = queue.getNPEmbed()
					let n = await msg.channel.send(embed);
					queue.nowPlayingMsg.clearReactions();
					queue.nowPlayingMsg = n;
					queue.generateReactions();
				} else if (args[0].toLowerCase() == "info" || args[0].toLowerCase() == "information") {
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg));
					queue.showInfo();
				} else if ("related".startsWith(args[0].toLowerCase())) {
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg));
					let mode = args[1];
					let index = parseInt(args[2])-1;
					let related = await queue.songs[0].related();
					if (related[index] && mode && ["p", "i"].includes(mode[0])) {
						let videoID = related[index].id;
						ytdl.getInfo(videoID).then(video => {
							let song = new songTypes.YouTubeSong(video, !queue || queue.songs.length <= 1);
							return handleSong(song, msg.channel, voiceChannel, mode[0] == "i");
						}).catch(reason => {
							manageYtdlGetInfoErrors(msg, reason, args[1]);
						});
					} else {
						if (related.length) {
							let body = "";
							related.forEach((songss, index) => {
								let toAdd = `${index+1}. **${songss.title}** (${common.prettySeconds(songss.length_seconds)})\n *— ${songss.author}*\n`;
								if (body.length + toAdd.length < 2000) body += toAdd;
							});
							let embed = new Discord.RichEmbed()
							.setAuthor(`Related videos`)
							.setDescription(body)
							.setFooter(`Use "&music related <play|insert> <index>" to queue an item from this list.`)
							.setColor("36393E")
							return msg.channel.send(embed);
						} else {
							return msg.channel.send("No related songs available.");
						}
					}
				} else if (args[0].toLowerCase() == "shuffle") {
					if (!msg.member.voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg));
					queue.songs = [queue.songs[0]].concat(queue.songs.slice(1).shuffle());
					return;
				} else if (args[0].toLowerCase() == "pause") {
					if (!msg.member.voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg));
					if (queue.pause()[0]) return;
				} else if (args[0].toLowerCase() == "resume") {
					if (!msg.member.voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg));
					if (queue.resume()[0]) return;
				} else if (args[0].match(/^pl(aylists?)?$/)) {
					return playlistCommand.command(msg, args, (songs, start, end, skip) => {
						bulkPlaySongs(msg, voiceChannel, songs, start, end, skip)
							});
				} else return msg.channel.send(lang.genericInvalidAction(msg));
			}
		}
	})
}
