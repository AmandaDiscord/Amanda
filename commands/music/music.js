const ytdl = require("ytdl-core");
const YouTube = require('simple-youtube-api');
const net = require("net");
const crypto = require("crypto");
const rp = require("request-promise");
const Discord = require("discord.js");
const path = require("path");

require("../../types.js");

let voiceEmptyDuration = 20000;

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { config, client, reloadEvent, reloader, commands, queueManager } = passthrough;

	let youtube = new YouTube(config.yt_api_key);

	let utils = require("../../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);

	let songTypes = require("./songtypes.js")(passthrough)
	reloader.useSync("./commands/music/songtypes.js", songTypes)
	let Song = songTypes.Song // intellisense sucks

	let queueFile = require("./queue.js")(passthrough)
	reloader.useSync("./commands/music/queue.js", queueFile)

	/**
	 * @param {Song} song
	 * @param {Discord.TextChannel} textChannel
	 * @param {Dscord.VoiceChannel} voiceChannel
	 * @param {Boolean} insert
	 */
	async function handleSong(song, textChannel, voiceChannel, insert) {
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
	 * @returns {Promise<void>}
	 */
	async function bulkPlaySongs(msg, voiceChannel, videoIDs, startString, endString, shuffle) {
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
		} else { callback([400, "Action does not exist"]); }
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
	/**
	 * @param {String} input
	 * @param {Discord.Message} message
	 * @param {String} firstWord
	 * @param {Boolean} intoPlaylist
	 * @returns {Promise<Song>}
	 */
	function searchYoutube(input, message, firstWord, intoPlaylist) {
		return new Promise(async resolve => {
			input = input.replace(/^<|>$/g, "");
			{
				let match = input.match("cadence\.(?:gq|moe)/cloudtube/video/([\\w-]+)");
				if (match) input = match[1];
			}
			if (firstWord.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
				if (intoPlaylist) {
					message.channel.send(`${message.author.username}, please use \`&music playlist <name> import <url>\` to import a playlist.`);
					return resolve(null);
				}
				if (firstWord.includes("?list=WL")) {
					message.channel.send(`${message.author.username}, your Watch Later playlist is private, so I can't read it. Give me a public playlist instead.`);
					return resolve(null);
				} else {
					try {
						let playlist = await youtube.getPlaylist(firstWord);
						let videos = await playlist.getVideos();
						return resolve(videos);
					} catch (e) {
						message.channel.send(`${message.author.username}, I couldn't read that playlist. Maybe you typed an invalid URL, or maybe the playlist hasn't been set public.`);
						return resolve(null);
					}
				}
			} else {
				ytdl.getInfo(input).then(video => {
					let song = new songTypes.YouTubeSong(video, !intoPlaylist && (!message.guild.queue || message.guild.queue.songs.length <= 1));
					resolve(song);
				}).catch(async () => {
					message.channel.sendTyping();
					let videos, selectmessage;
					async function editOrSend() {
						if (selectmessage) return selectmessage.edit(...arguments);
						else return selectmessage = await message.channel.send(...arguments);
					}
					let i = 0;
					while (!videos) {
						i++;
						try {
							videos = JSON.parse(await rp(`https://invidio.us/api/v1/search?order=relevance&q=${encodeURIComponent(input)}`));
						} catch (e) {
							if (i <= 3) {
								await editOrSend(`Search failed. I'll try again: hold tight. (attempts: ${i})`);
								await new Promise(rs => setTimeout(() => rs(), 2500));
							} else {
								editOrSend("Couldn't reach Invidious. Try again later? ;-;");
								return resolve(null);
							}
						}
					}
					if (!videos.length) {
						editOrSend("No videos were found with those search terms");
						return resolve(null);
					}
					videos = videos.filter(v => v.lengthSeconds > 0).slice(0, 10);
					let videoResults = videos.map((video, index) => `${index+1}. **${Discord.escapeMarkdown(video.title)}** (${queueFile.prettySeconds(video.lengthSeconds)})`);
					let embed = new Discord.RichEmbed()
						.setTitle("Song selection")
						.setDescription(videoResults.join("\n"))
						.setFooter(`Type a number from 1-${videos.length} to queue that item.`)
						.setColor("36393E")
					await editOrSend({embed});
					let collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), {maxMatches: 1, time: 60000});
					collector.next.then(async newmessage => {
						let videoIndex = parseInt(newmessage.content);
						if (!videoIndex || !videos[videoIndex-1]) return Promise.reject();
						ytdl.getInfo(videos[videoIndex-1].videoId).then(video => {
							let song = new songTypes.YouTubeSong(video, !message.guild.queue || message.guild.queue.songs.length <= 1);
							resolve(song);
						}).catch(error => {
							manageYtdlGetInfoErrors(newmessage, error);
							resolve(null);
						});
						selectmessage.edit(embed.setDescription("» "+videoResults[videoIndex-1]).setFooter(""));
					}).catch(() => {
						selectmessage.edit(embed.setTitle("Song selection cancelled").setDescription("").setFooter(""));
						resolve(null);
					});
				});
			}
		});
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
					if (!permissions.has("CONNECT")) return msg.channel.send(lang.permissionVoiceJoin(msg));
					if (!permissions.has("SPEAK")) return msg.channel.send(lang.permissionVoiceSpeak(msg));
					if (!args[1]) return msg.channel.send(lang.input.music.playableRequired(msg));
					let result = await searchYoutube(args.slice(1).join(" "), msg, args[1]);
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
					let totalLength = "\nTotal length: "+queueFile.prettySeconds(queue.songs.reduce((p,c) => (p+parseInt(c.source == "YouTube" ? c.basic.length_seconds : 0)), 0)); //TODO: move this to the song object
					let body = queue.songs.map((songss, index) => `${index+1}. **${songss.title}** (${queueFile.prettySeconds(songss.source == "YouTube" ? songss.basic.length_seconds: "LIVE")})`).join('\n');
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
					let embed = new Discord.RichEmbed()
					.setDescription(`Now playing: **${queue.songs[0].title}**`)
					.addField("­",
						queue.connection
						? queueFile.songProgress(queue.connection.dispatcher, queue)
						: "0:00"
					)
					.setColor("36393E")
					let n = await msg.channel.send(embed);
					queue.nowPlayingMsg.clearReactions();
					queue.nowPlayingMsg = n;
					queue.generateReactions();
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
								let toAdd = `${index+1}. **${songss.title}** (${queueFile.prettySeconds(songss.length_seconds)})\n *— ${songss.author}*\n`;
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
				} /* else if (args[0].toLowerCase() == "stash") {
					let stashes = await utils.sql.all("SELECT * FROM Stashes WHERE author = ?", msg.author.id);
					stashes.forEach((s, i) => (s.index = i+1));
					if (!args[1]) args[1] = "";
					if (args[1].toLowerCase() == "play" || args[1].toLowerCase() == "pop") {
						// Play
						if (!voiceChannel) return msg.channel.send("You are not in a voice channel");
						if (!args[2] || !stashes[args[2]-1]) return msg.channel.send("Please give me the number of the stash you want to play");
						bulkPlaySongs(msg, voiceChannel, stashes[args[2]-1].songs.split("|"));
						if (args[1].toLowerCase() == "pop") {
							await utils.sql.all("DELETE FROM Stashes WHERE stashID = ?", stashes[args[2]-1].stashID);
						}
					} else if (args[1].toLowerCase() == "save") {
						// Save
						if (!queue) return msg.channel.send("There is nothing playing.");
						let stashmsg = await msg.channel.send("Stashing queue, please wait...");
						utils.sql.all(
							"INSERT INTO Stashes VALUES (NULL, ?, ?, ?, ?)",
							[msg.author.id, queue.songs.map(s => s.id).join("|"), queue.songs.reduce((p, c) => (p + parseInt(c.basic.length_seconds)), 0), Date.now()]
						).then(() => {
							stashmsg.edit("Queue stashed successfully! Hit ⏹ to stop playing.");
							stashmsg.reactionMenu([{emoji: "⏹", ignore: "total", actionType: "js", actionData: () => {
								if (!queue) return;
								queue.songs = [];
								queue.connection.dispatcher.end();
								reloadEvent.emit("musicOut", "queues", queueManager.storage);
							}}]);
						}).catch(async error => {
							stashmsg.edit(await utils.stringify(error));
						});
					} else {
						// Display
						if (stashes.length) {
							let embed = new Discord.RichEmbed()
							.setAuthor(msg.author.username+"'s queue stash", msg.author.smallAvatarURL)
							.setDescription(stashes.map(s => {
								let createdString = Math.floor((Date.now()-s.created)/1000/60/60/24);
								if (createdString == 0) createdString = "today";
								else if (createdString == 1) createdString = "yesterday";
								else createdString += " days ago";
								return `${s.index}. created ${createdString}, ${s.songs.split("|").length} songs, total length ${queueFile.prettySeconds(s.length)}`;
							}).join("\n"))
							.setFooter(`Use "&music stash <play|pop> <number>" to send a stash to the queue.`);
							msg.channel.send(embed);
						} else {
							msg.channel.send("No stashed queues. Use `&music stash save` to stop playing a queue and send it to the stash.");
						}
					}
				} */ else if (args[0].match(/^pl(aylists?)?$/)) {
					let playlistName = args[1];
					if (playlistName == "show") {
						let playlists = await utils.sql.all("SELECT * FROM Playlists");
						return msg.channel.send(new Discord.RichEmbed().setTitle("Available playlists").setColor("36393E").setDescription(playlists.map(p => p.name).join("\n")));
					}
					if (!playlistName) return msg.channel.send(msg.author.username+", you must name a playlist. Use `&music playlists show` to show all playlists.");
					let playlistRow = await utils.sql.get("SELECT * FROM Playlists WHERE name = ?", playlistName);
					if (!playlistRow) {
						if (args[2] == "create") {
							await utils.sql.all("INSERT INTO Playlists VALUES (NULL, ?, ?)", [msg.author.id, playlistName]);
							return msg.channel.send(`${msg.author.username}, Created playlist **${playlistName}**`);
						} else {
							return msg.channel.send(`${msg.author.username}, That playlist does not exist. Use \`&music playlist ${playlistName} create\` to create it.`);
						}
					}
					let songs = await utils.sql.all("SELECT * FROM PlaylistSongs INNER JOIN Songs ON Songs.videoID = PlaylistSongs.videoID WHERE playlistID = ?", playlistRow.playlistID);
					let orderedSongs = [];
					let song = songs.find(row => !songs.some(r => r.next == row.videoID));
					while (song) {
						orderedSongs.push(song);
						if (song.next) song = songs.find(row => row.videoID == song.next);
						else song = null;
						if (orderedSongs.includes(song)) {
							await unbreakDatabase();
							return;
						}
					}
					if (orderedSongs.length != songs.length) {
						await unbreakDatabase();
						return;
					}
					async function unbreakDatabase() {
						await utils.sql.all("BEGIN TRANSACTION");
						await Promise.all(songs.map((row, index) => {
							return utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [(songs[index+1] ? songs[index+1].videoID : null), row.playlistID, row.videoID]);
						}));
						await utils.sql.all("END TRANSACTION");
						return msg.channel.send(`${msg.author.username}, The database entries for that playlist are inconsistent. The inconsistencies have been resolved by resetting the order of the songs in that playlist. Apart from the song order, no data was lost. Other playlists were not affected.`);
					}
					let action = args[2] || "";
					if (action.toLowerCase() == "add") {
						if (playlistRow.author != msg.author.id) return msg.channel.send(lang.playlistNotOwned(msg));
						let videoID;
						if (!args[3]) return msg.channel.send(`${msg.author.username}, You must provide a YouTube link or some search terms`);
						let result = await searchYoutube(args.slice(3).join(" "), msg, args[3], true);
						if (result != null) videoID = result.basic.id;
						else return;
						ytdl.getInfo(videoID).then(async video => {
							if (orderedSongs.some(row => row.videoID == video.video_id)) return msg.channel.send(lang.playlistDuplicateItem(msg));
							await Promise.all([
								utils.sql.all("INSERT INTO Songs SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM Songs WHERE videoID = ?)", [video.video_id, video.title, video.length_seconds, video.video_id]),
								utils.sql.all("INSERT INTO PlaylistSongs VALUES (?, ?, NULL)", [playlistRow.playlistID, video.video_id]),
								utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next IS NULL AND videoID != ?", [video.video_id, playlistRow.playlistID, video.video_id])
							]);
							return msg.channel.send(`${msg.author.username}, Added **${video.title}** to playlist **${playlistName}**`);
						}).catch(e => {
							return msg.channel.send(`${msg.author.username}, That is not a valid YouTube link`);
						});
					} else if (action.toLowerCase() == "remove") {
						if (playlistRow.author != msg.author.id) return msg.channel.send(lang.playlistNotOwned(msg));
						let index = parseInt(args[3]);
						if (!index) return msg.channel.send(`${msg.author.username}, Please provide the index of the item to remove`);
						index = index-1;
						if (!orderedSongs[index]) return msg.channel.send(lang.genericIndexOutOfRange(msg));
						let toRemove = orderedSongs[index];
						await Promise.all([
							utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [toRemove.next, toRemove.playlistID, toRemove.videoID]),
							utils.sql.all("DELETE FROM PlaylistSongs WHERE playlistID = ? AND videoID = ?", [playlistRow.playlistID, toRemove.videoID])
						]);
						return msg.channel.send(`${msg.author.username}, Removed **${toRemove.name}** from playlist **${playlistName}**`);
					} else if (action.toLowerCase() == "move") {
						if (playlistRow.author != msg.author.id) return msg.channel.send(lang.playlistNotOwned(msg));
						let from = parseInt(args[3]);
						let to = parseInt(args[4]);
						if (!from || !to) return msg.channel.send(`${msg.author.username}, Please provide an index to move from and an index to move to.`);
						from--; to--;
						if (!orderedSongs[from]) return msg.channel.send(lang.genericIndexOutOfRange(msg));
						if (!orderedSongs[to]) return msg.channel.send(lang.genericIndexOutOfRange(msg));
						let fromRow = orderedSongs[from], toRow = orderedSongs[to];
						if (from < to) {
							await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [fromRow.next, fromRow.playlistID, fromRow.videoID]); // update row before item
							await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [toRow.next, fromRow.playlistID, fromRow.videoID]); // update moved item
							await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [fromRow.videoID, fromRow.playlistID, toRow.videoID]); // update row before moved item
						} else if (from > to) {
							await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [fromRow.next, fromRow.playlistID, fromRow.videoID]); // update row before item
							await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [fromRow.videoID, fromRow.playlistID, toRow.videoID]); // update row before moved item
							await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [toRow.videoID, fromRow.playlistID, fromRow.videoID]); // update moved item
						} else {
							return msg.channel.send(`${msg.author.username}, Those two indexes are equal.`);
						}
						return msg.channel.send(`${msg.author.username}, Moved **${fromRow.name}** to position **${to+1}**`);
					} else if (action.toLowerCase() == "search" || action.toLowerCase() == "find") {
						let body = orderedSongs
							.map((songss, index) => `${index+1}. **${songss.name}** (${queueFile.prettySeconds(songss.length)})`)
							.filter(s => s.toLowerCase().includes(args.slice(3).join(" ").toLowerCase()))
							.join("\n");
						if (body.length > 2000) {
							body = body.slice(0, 1998).split("\n").slice(0, -1).join("\n")+"\n…";
						}
						let embed = new Discord.RichEmbed()
						.setDescription(body)
						.setColor("36393E")
						msg.channel.send(embed);

					} else if (action.toLowerCase() == "play" || action.toLowerCase() == "p" || action.toLowerCase() == "shuffle") {
						bulkPlaySongs(msg, voiceChannel, orderedSongs.map(song => song.videoID), args[3], args[4], action.toLowerCase()[0] == "s");
					} else if (action.toLowerCase() == "import") {
						if (playlistRow.author != msg.author.id) return msg.channel.send(lang.playlistNotOwned(msg));
						if (args[3].match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
							let playlist = await youtube.getPlaylist(args[3]);
							let videos = await playlist.getVideos();
							let promises = [];
							videos = videos.filter((video, i) => {
								if (orderedSongs.some(row => row.videoID == video.id)) return false;
								else if (videos.slice(0, i).some(v => v.id == video.id)) return false;
								else return true;
							});
							let editmsg = await msg.channel.send("Importing playlist. This could take a moment...\n(Fetching song info)");
							videos = await Promise.all(videos.map(video => ytdl.getInfo(video.id)));
							if (!videos.length) return editmsg.edit(`${msg.author.username}, all videos in that playlist have already been imported.`);
							await editmsg.edit("Importing playlist. This could take a moment...\n(Updating database)");
							for (let i = 0; i < videos.length; i++) {
								let video = videos[i];
								promises.push(utils.sql.all(
									"INSERT INTO Songs SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM Songs WHERE videoID = ?)",
									[video.video_id, video.title, video.length_seconds, video.video_id]
								));
								if (i != videos.length-1) {
									let nextVideo = videos[i+1];
									promises.push(utils.sql.all(
										"INSERT INTO PlaylistSongs VALUES (?, ?, ?)",
										[playlistRow.playlistID, video.video_id, nextVideo.video_id]
									));
								} else {
									promises.push(utils.sql.all(
										"INSERT INTO PlaylistSongs VALUES (?, ?, NULL)",
										[playlistRow.playlistID, video.video_id]
									));
								}
							}
							promises.push(utils.sql.all(
								"UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next IS NULL AND videoID != ?",
								[videos[0].video_id, playlistRow.playlistID, videos.slice(-1)[0].video_id]
							));
							await Promise.all(promises);
							editmsg.edit(`All done! Check out your playlist with **&music playlist ${playlistName}**.`);
						} else return msg.channel.send(`${msg.author.username}, please provide a YouTube playlist link.`);
					} else if (action.toLowerCase() == "delete") {
						if (playlistRow.author != msg.author.id) return msg.channel.send(lang.playlistNotOwned(msg));
						let deletePromptEmbed = new Discord.RichEmbed().setColor("dd1d1d").setDescription(
							"This action will permanently delete the playlist `"+playlistRow.name+"`. "+
							"After deletion, you will not be able to play, display, or modify the playlist, and anyone will be able to create a new playlist with the same name.\n"+
							"You will not be able to undo this action.\n\n"+
							"<:bn_del:331164186790854656> - confirm deletion\n"+
							"<:bn_ti:327986149203116032> - ignore"
						);
						let message = await msg.channel.send(deletePromptEmbed)
						message.reactionMenu([
							{emoji: client.emojis.get(client.parseEmoji("<:bn_del:331164186790854656>").id), allowedUsers: [msg.author.id], remove: "all", ignore: "total", actionType: "js", actionData: async () => {
								await Promise.all([
									utils.sql.all("DELETE FROM Playlists WHERE playlistID = ?", playlistRow.playlistID),
									utils.sql.all("DELETE FROM PlaylistSongs WHERE playlistID = ?", playlistRow.playlistID)
								]);
								deletePromptEmbed.setDescription("Playlist deleted.");
								message.edit(deletePromptEmbed);
							}},
							{emoji: client.emojis.get(client.parseEmoji("<:bn_ti:327986149203116032>").id), allowedUsers: [msg.author.id], remove: "all", ignore: "total", actionType: "edit", actionData: new Discord.RichEmbed().setColor("36393e").setDescription("Playlist deletion cancelled")}
						]);
					} else {
						let author = [];
						if (client.users.get(playlistRow.author)) {
							author.push(`${client.users.get(playlistRow.author).tag} — ${playlistName}`, client.users.get(playlistRow.author).smallAvatarURL);
						} else {
							author.push(playlistName);
						}
						let totalLength = "\nTotal length: "+queueFile.prettySeconds(orderedSongs.reduce((p,c) => (p+parseInt(c.length)), 0));
						let body = orderedSongs.map((songss, index) => `${index+1}. **${songss.name}** (${queueFile.prettySeconds(songss.length)})`).join('\n');
						if (body.length+totalLength.length > 2000) {
							let first = body.slice(0, 995-totalLength.length/2).split("\n").slice(0, -1).join("\n");
							let last = body.slice(totalLength.length/2-995).split("\n").slice(1).join("\n");
							body = first+"\n…\n"+last;
						}
						body += totalLength;
						let embed = new Discord.RichEmbed()
						.setAuthor(author[0], author[1])
						//.setDescription(orderedSongs.map((row, index) => `${index+1}. **${row.name}** (${queueFile.prettySeconds(row.length)})`).join("\n")+"\nTotal length: "+queueFile.prettySeconds(totalLength))
						.setDescription(body)
						.setColor("36393E")
						msg.channel.send(embed);
					}
				} else return msg.channel.send(lang.genericInvalidAction(msg));
			}
		}
	})
}
