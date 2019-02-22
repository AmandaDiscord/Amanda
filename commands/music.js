let ytdl = require("ytdl-core");
let ytdlDiscord = require("ytdl-core-discord");
let YouTube = require('simple-youtube-api');
const net = require("net");
let crypto = require("crypto");
let rp = require("request-promise");

const voiceEmptyDuration = 20000;

module.exports = function(passthrough) {
	let { config, Discord, client, utils, reloadEvent } = passthrough;
	let youtube = new YouTube(config.yt_api_key);
	let queueStorage = utils.queueStorage;

	/**
	 * A class meant to only be extended. Contains basic information for audio streams
	 * @param {String} title The title of the audio
	 * @param {String} source Where the audio stream is coming from
	 * @param {boolean} live If the audio is being streamed live
	 */
	class Song {
		constructor(title, source, live) {
			this.title = title;
			this.source = source;
			this.live = live;
			this.streaming = false;
			this.connectionPlayFunction = "playStream";
		}
		/**
		 * A method to create basic data stored in this class instance
		 */
		toObject() {
			return Object.assign({
				title: this.title,
				source: this.source,
				live: this.live
			}, this.object());
		}
		/**
		 * A method to get the basic information assigned from this.toObject();
		 * @returns {Object} Basic information about this class instance
		 */
		object() {
			// Intentionally empty. Subclasses should put additional properties for toObject here.
		}
		/**
		 * A method to return the audio stream linked to this class instance
		 * @returns {Stream} A data stream related to the audio of this class instance
		 */
		getStream() {
			this.streaming = true;
			return this.stream();
		}
		/**
		 * A method to return related audio clips to that of this class instance
		 * @returns {Array} An Array of related content
		 */
		related() {
			return [];
		}
	}

	async function YTSongObjectFromURL(url, cache) {
		let info = await ytdl.getInfo(url);
		return new YouTubeSong(info, cache);
	}
	class YouTubeSong extends Song {
		constructor(info, cache) {
			super(info.title, "YouTube", false);
			this.connectionPlayFunction = "playOpusStream";
			this.url = info.video_url;
			this.basic = {
				id: info.video_id,
				title: info.title,
				author: info.author.name,
				length_seconds: info.length_seconds
			}
			if (cache) this.info = info;
			else this.info = null;
		}
		object() {
			return {
				basic: this.basic
			}
		}
		toUnified() {
			return {
				title: this.title,
				author: this.basic.author,
				thumbnailSmall: `https://i.ytimg.com/vi/${this.basic.id}/mqdefault.jpg`,
				thumbnailLarge: `https://i.ytimg.com/vi/${this.basic.id}/hqdefault.jpg`,
				length: prettySeconds(this.basic.length_seconds),
				lengthSeconds: this.basic.length_seconds
			}
		}
		deleteCache() {
			this.info = null;
		}
		stream() {
			return this.getInfo(true).then(info => ytdlDiscord.downloadFromInfo(info));
		}
		getInfo(cache, force) {
			if (this.info || force) return Promise.resolve(this.info);
			else {
				return ytdl.getInfo(this.basic.id).then(info => {
					if (cache) this.info = info;
					return info;
				});
			}
		}
		async related() {
			await this.getInfo(true);
			return this.info.related_videos.filter(v => v.title).slice(0, 10);
		}
	}

	class FriskySong extends Song {
		constructor(station) {
			super("Frisky Radio", "Frisky", true);
			this.station = station;
		}
		object() {
			return {
				station: this.station
			}
		}
		toUnified() {
			return {
				title: this.title,
				author: "Frisky Radio",
				thumbnailSmall: "/images/frisky.png",
				thumbnailLarge: "/images/frisky.png",
				length: "LIVE"
			}
		}
		async stream() {
			let host, path;
			if (this.station == "frisky") {
				host = "stream.friskyradio.com", path = "/frisky_mp3_hi";
			} else if (this.station == "deep") {
				host = "deep.friskyradio.com", path = "/friskydeep_aachi";
			} else if (this.station == "chill") {
				host = "chill.friskyradio.com", path = "/friskychill_mp3_hi";
			} else {
				throw new Error("song.station was "+this.station+", expected 'frisky', 'deep' or 'chill'");
			}
			let body = await rp("https://www.friskyradio.com/api/v2/nowPlaying");
			try {
				let data = JSON.parse(body);
				let item = data.data.items.find(i => i.station == song.station);
				if (item && item.sp("episode.title")) {
					song.title = "Frisky Radio: "+item.sp("episode.title");
					if (song.station != "frisky") song.title += ` (${song.station[0].toUpperCase()+song.station.slice(1)}`;
				}
			} catch (e) {}
			let socket = new net.Socket();
			return new Promise(resolve => socket.connect(80, host, () => {
				socket.write(`GET ${path} HTTP/1.0\r\n\r\n`);
				resolve(socket);
			}));
		}
	}

	class Queue {
		constructor(textChannel, voiceChannel) {
			this.textChannel = textChannel;
			this._voiceChannel = voiceChannel;
			this.id = this.textChannel.guild.id;
			this.connection = undefined;
			this._dispatcher = undefined;
			this.songs = [];
			this.volume = 5;
			this.playing = true;
			this.skippable = false;
			this.auto = false;
			this.nowPlayingMsg = undefined;
			this.queueStorage = queueStorage;
			this.queueStorage.addQueue(this);
			voiceChannel.join().then(connection => {
				this.connection = connection;
				if (this.songs.length) this.play();
			});
			this.voiceLeaveTimeout = setTimeout(new Function());
		}
		get voiceChannel() {
			return this.connection ? this.connection.channel : this._voiceChannel;
		}
		get dispatcher() {
			return this.connection.dispatcher || this._dispatcher;
		}
		toObject() {
			return {
				id: this.id,
				songs: this.songs.map(s => s.toUnified()),
				time: this.dispatcher.time,
				playing: this.playing,
				skippable: this.skippable,
				auto: this.auto,
				volume: this.volume,
			}
		}
		dissolve() {
			this.songs.length = 0;
			this.auto = false;
			clearTimeout(this.voiceLeaveTimeout);
			if (this.connection && this.connection.dispatcher) this.connection.dispatcher.end();
			if (this.voiceChannel) this.voiceChannel.leave();
			if (this.nowPlayingMsg) this.nowPlayingMsg.clearReactions();
			if (this.reactionMenu) this.reactionMenu.destroy(true);
			this.destroy();
		}
		destroy() {
			this.queueStorage.storage.delete(this.id);
		}
		addSong(song, insert) {
			let position; // the actual position to insert into, `undefined` to push
			if (insert == undefined) { // no insert? just push
				position = undefined;
			} else if (typeof(insert) == "number") { // number? insert into that point
				position = insert;
			} else if (typeof(insert) == "boolean") { // boolean?
				if (insert) position = 1; // if insert is true, insert
				else position = undefined; // otherwise, push
			}
			if (position == undefined) this.songs.push(song);
			else this.songs.splice(position, 0, song);
			if (this.songs.length == 1) {
				if (this.connection) this.play();
			} else {
				if (song.deleteCache) song.deleteCache();
			}
		}
		voiceStateUpdate(oldMember, newMember) {
			let count = this.voiceChannel.members.filter(m => !m.user.bot).size;
			if (count == 0) {
				if (this.voiceLeaveTimeout._called || !this.voiceLeaveTimeout._onTimeout) {
					this.voiceLeaveTimeout = setTimeout(() => {
						this.textChannel.send("Everyone left, so I have as well.");
						this.dissolve()
					}, voiceEmptyDuration);
					this.textChannel.send("No users left in my voice channel. I will stop playing in "+voiceEmptyDuration/1000+" seconds if nobody rejoins.");
				}
			} else {
				clearTimeout(this.voiceLeaveTimeout);
			}
		}
		getNPEmbed() {
			let song = this.songs[0];
			let embed = new Discord.RichEmbed().setColor("36393E")
			.setDescription(`Now playing: **${song.title}**`)
			.addField("­",songProgress(this.dispatcher, this, !this.connection.dispatcher)+(this.auto ? "\n\n**Auto mode on.**" : ""));
			if (!this.textChannel.permissionsFor(client.user).has("ADD_REACTIONS")) embed.addField("­", "Please give me permission to add reactions to use player controls!");
			return embed;
		}
		generateReactions() {
			if (this.reactionMenu) this.reactionMenu.destroy(true);
			if (this.nowPlayingMsg) this.reactionMenu = this.nowPlayingMsg.reactionMenu([
				{ emoji: "⏯", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
					if (!this.voiceChannel.members.has(user.id)) return;
					if (this.playing) this.pause();
					else this.resume();
				}},
				{ emoji: "⏭", remove: "user", actionType: "js", actionData: (msg, emoji, user, messageReaction) => {
					if (!this.voiceChannel.members.has(user.id)) return;
					this.skip();
				}},
				{ emoji: "⏹", remove: "all", ignore: "total", actionType: "js", actionData: (msg, emoji, user) => {
					if (!this.voiceChannel.members.has(user.id)) return;
					this.stop();
				}}
			]);
		}
		queueAction(code) {
			return (web) => {
				let result = code();
				if (web) {
					if (result[0]) { // no error
						if (result[1]) { // output
							return [200, result[1]];
						} else { // no output
							return [204, ""];
						}
					} else { // error
						return [400, result[1] || ""];
					}
				} else {
					if (result[1]) return this.textChannel.send(result[1]);
				}
				reloadEvent.emit("musicOut", "queues", queueStorage.storage);
				return result;
			}
		}
		async play() {
			let stream = await this.songs[0].getStream();
			const dispatcher = this.connection[this.songs[0].connectionPlayFunction](stream);
			this._dispatcher = dispatcher;
			dispatcher.once("start", async () => {
				dispatcher.setVolumeLogarithmic(this.volume / 5);
				dispatcher.setBitrate("auto");
				this.skippable = true;
				reloadEvent.emit("musicOut", "queues", queueStorage.storage);
				let dispatcherEndCode = new Function();
				let updateProgress = () => {
					if (this.songs[0]) return this.nowPlayingMsg.edit(this.getNPEmbed());
					else return Promise.resolve();
				}
				if (!this.nowPlayingMsg) {
					await this.textChannel.send(this.getNPEmbed()).then(n => this.nowPlayingMsg = n);
					this.generateReactions();
				} else {
					await updateProgress();
				}
				let npStartTimeout = setTimeout(() => {
					if (!this.songs[0] || !this.connection.dispatcher) return;
					updateProgress();
					let updateProgressInterval = setInterval(() => {
						updateProgress();
					}, 5000);
					dispatcherEndCode = () => {
						clearInterval(updateProgressInterval);
						updateProgress();
					};
				}, 5000-dispatcher.time%5000);
				function handleError(error) { console.error(error) };
				dispatcher.on('error', handleError);
				dispatcher.once("end", () => {
					dispatcher.player.streamingData.pausedTime = 0;
					dispatcher.removeListener("error", handleError);
					clearTimeout(npStartTimeout);
					dispatcherEndCode();
					this.skippable = false;
					new Promise(resolve => {
						if (this.auto && this.songs.length == 1) {
							this.songs[0].getInfo(false).then(info => {
								let related = info.related_videos.filter(v => v.title)[0];
								if (related) {
									let videoID = related.id;
									ytdl.getInfo(videoID).then(video => {
										let song = new YouTubeSong(video, true); //TODO: move this to the song object
										this.addSong(song);
										resolve();
									}).catch(reason => {
										manageYtdlGetInfoErrors(this.textChannel, reason, args[1]);
										resolve();
									});
								}
							});
						} else resolve();
					}).then(() => {
						this.songs.shift();
						if (this.songs.length) this.play();
						else this.dissolve();
					});
				});
			});
		}
		pause(web) {
			return this.queueAction(() => {
				if (this.connection && this.connection.dispatcher && this.playing && !this.songs[0].live) {
					this.playing = false;
					this.connection.dispatcher.pause();
					this.nowPlayingMsg.edit(this.getNPEmbed(this.connection.dispatcher, this));
					return [true];
				} else if (!this.playing) {
					return [false, "Music is already paused."];
				} else if (this.songs[0].live) {
					return [false, "Cannot pause live radio."];
				} else {
					return [false, client.lang.voiceCannotAction("paused")];
				}
			})(web);
		}
		resume(web) {
			return this.queueAction(() => {
				if (this.connection && this.connection.dispatcher && !this.playing) {
					this.playing = true;
					this.connection.dispatcher.resume();
					this.nowPlayingMsg.edit(this.getNPEmbed(this.connection.dispatcher, this));
					return [true];
				} else if (this.playing) {
					return [false, "Music is not paused."];
				} else {
					return [false, client.lang.voiceCannotAction("resumed")];
				}
			})(web);
		}
		skip(web) {
			return this.queueAction(() => {
				if (this.connection && this.connection.dispatcher && this.playing) {
					this.connection.dispatcher.end();
					return [true];
				} else if (!this.playing) {
					return [false, "You cannot skip while music is paused. Resume, then skip."];
				} else {
					return [false, client.lang.voiceCannotAction("skipped")];
				}
			})(web);
		}
		stop(web) {
			return this.queueAction(() => {
				if (this.connection) {
					this.dissolve();
					return [true];
				} else {
					return [false, "I have no idea why that didn't work."];
				}
			})(web);
		}
	}

	utils.addTemporaryListener(reloadEvent, "music", __filename, function(action) {
		if (action == "getQueues") {
			reloadEvent.emit("musicOut", "queues", queueStorage.storage);
		} else if (action == "getQueue") {
			let serverID = [...arguments][1];
			if (!serverID) return;
			let queue = queueStorage.storage.get(serverID);
			if (!queue) return;
			reloadEvent.emit("musicOut", "queue", queue);
		} else if (["skip", "stop", "pause", "resume"].includes(action)) {
			let [serverID, callback] = [...arguments].slice(1);
			let queue = queueStorage.storage.get(serverID);
			if (!queue) return callback([400, "Server is not playing music"]);
			let result = queue[action](true);
			if (result[0]) callback([200, result[1]]);
			else callback([400, result[1]]);
		} else { callback([400, "Action does not exist"]); }
	});

	async function handleSong(song, textChannel, voiceChannel, insert) {
		let queue = queueStorage.storage.get(textChannel.guild.id) || new Queue(textChannel, voiceChannel);
		queue.addSong(song, insert);
	}

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
		if (!voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
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
						let queue = queueStorage.storage.get(msg.guild.id);
						let song = new YouTubeSong(video, !queue || queue.songs.length <= 1);
						handleSong(song, msg.channel, voiceChannel);
					});
				}
			});
		})();
	}

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

	function prettySeconds(seconds) {
		if (isNaN(seconds)) return seconds;
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
	}

	function songProgress(dispatcher, queue, done) {
		if (!queue.songs.length) return "0:00/0:00";
		if (queue.songs[0].source == "YouTube") { //TODO: move this to the song object
			let max = queue.songs[0].basic.length_seconds;
			let current = Math.floor(dispatcher.time/1000);
			if (current > max || done) current = max;
			return `\`[ ${prettySeconds(current)} ${utils.progressBar(35, current, max, dispatcher.paused ? " [PAUSED] " : "")} ${prettySeconds(max)} ]\``;
		} else if (queue.songs[0].source == "Frisky") {
			let current = Math.floor(dispatcher.time/1000);
			return `\`[ ${prettySeconds(current)} ${"=".repeat(35)} LIVE ]\``;
		} else {
			return "Cannot render progress for source `"+queue.songs[0].source+"`.";
		}
	}

	return {
		"musictoken": {
			usage: "none",
			description: "Assign a login token for use on Amanda's web dashboard",
			aliases: ["token", "musictoken", "webtoken"],
			category: "music",
			process: async function(msg, suffix) {
				if (msg.channel.type == "text") return msg.channel.send(`Please use this command in a DM.`);
				await utils.sql.all("DELETE FROM WebTokens WHERE userID = ?", msg.author.id);
				let hash = crypto.createHash("sha256").update(""+Math.random()).digest("hex");
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
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(client.lang.command.guildOnly(msg));
				const voiceChannel = msg.member.voiceChannel;
				if (!voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
				let station = ["frisky", "deep", "chill"].includes(suffix) ? suffix : "frisky";
				let stream = new FriskySong(station);
				return handleSong(stream, msg.channel, voiceChannel);
			}
		},
		"music": {
			usage: "none",
			description: "You're not supposed to see this",
			aliases: ["music", "m"],
			category: "music",
			process: async function(msg, suffix) {
				if (msg.channel.type != "text") return msg.channel.send(client.lang.command.guildOnly(msg));
				let allowed = (await Promise.all([utils.hasPermission(msg.author, "music"), utils.hasPermission(msg.guild, "music")])).includes(true);
				if (!allowed) {
					let owner = await client.fetchUser("320067006521147393")
					return msg.channel.send(`${msg.author.username}, you or this guild is not part of the partner system. Information can be obtained by DMing ${owner.tag}`);
				}
				let args = suffix.split(" ");
				let queue = queueStorage.storage.get(msg.guild.id);
				const voiceChannel = msg.member.voiceChannel;
				if (args[0].toLowerCase() == "play" || args[0].toLowerCase() == "insert" || args[0].toLowerCase() == "p" || args[0].toLowerCase() == "i") {
					if (!voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(client.lang.permissionVoiceJoin(msg));
					if (!permissions.has("SPEAK")) return msg.channel.send(client.lang.permissionVoiceSpeak(msg));
					if (!args[1]) return msg.channel.send(client.lang.input.music.playableRequired(msg));
					args[1] = args[1].replace(/^<|>$/g, "");
					{
						let match = args[1].match("cadence\.(?:gq|moe)/cloudtube/video/([\\w-]+)");
						if (match) args[1] = match[1];
					}
					if (args[1].match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
						if (args[1].includes("?list=WL")) {
							return msg.channel.send(`${msg.author.username}, your Watch Later playlist is private, so I can't read it. Give me a public playlist instead.`);
						} else {
							try {
								let playlist = await youtube.getPlaylist(args[1]);
								let videos = await playlist.getVideos();
								bulkPlaySongs(msg, voiceChannel, videos.map(video => video.id), args[2], args[3]);
							} catch (e) {
								return msg.channel.send(`${msg.author.username}, I couldn't read that playlist. Maybe you typed an invalid URL, or maybe the playlist hasn't been set public.`);
							}
						}
					} else {
						ytdl.getInfo(args[1]).then(video => {
							let song = new YouTubeSong(video, !queue || queue.songs.length <= 1);
							return handleSong(song, msg.channel, voiceChannel, args[0][0] == "i");
						}).catch(async reason => {
							let searchString = args.slice(1).join(" ");
							msg.channel.sendTyping();
							let videos;
							let selectMsg;
							async function editOrSend() {
								if (selectMsg) return selectMsg.edit(...arguments);
								else return selectMsg = await msg.channel.send(...arguments);
							}
							let i = 0;
							while (!videos) {
								i++;
								try {
									videos = JSON.parse(await rp(`https://invidio.us/api/v1/search?order=relevance&q=${encodeURIComponent(searchString)}`));
								} catch (e) {
									if (i <= 3) {
										await editOrSend(`Search failed. I'll try again: hold tight. (attempts: ${i})`);
										await new Promise(resolve => setTimeout(() => resolve(), 2500));
									} else {
										return editOrSend("Couldn't reach Invidious. Try again later? ;-;");
									}
								}
							}
							if (!videos.length) return editOrSend("No videos were found with those search terms");
							videos = videos.filter(v => v.lengthSeconds > 0).slice(0, 10);
							let videoResults = videos.map((video, index) => `${index+1}. **${Discord.escapeMarkdown(video.title)}** (${prettySeconds(video.lengthSeconds)})`);
							let embed = new Discord.RichEmbed()
								.setTitle("Song selection")
								.setDescription(videoResults.join("\n"))
								.setFooter(`Type a number from 1-${videos.length} to queue that item.`)
								.setColor("36393E")
							await editOrSend({embed});
							let collector = msg.channel.createMessageCollector((m => m.author.id == msg.author.id), {maxMatches: 1, time: 60000});
							collector.next.then(async newmsg => {
								let videoIndex = parseInt(newmsg.content);
								if (!videoIndex || !videos[videoIndex-1]) return Promise.reject();
								ytdl.getInfo(videos[videoIndex-1].videoId).then(video => {
									let song = new YouTubeSong(video, !queue || queue.songs.length <= 1);
									handleSong(song, newmsg.channel, voiceChannel, args[0][0] == "i");
								}).catch(error => manageYtdlGetInfoErrors(newmsg, error, args[1]));
								//selectMsg.edit(embed.setDescription("").setFooter("").setTitle("").addField("Song selected", videoResults[videoIndex-1]));
								selectMsg.edit(embed.setDescription("» "+videoResults[videoIndex-1]).setFooter(""));
							}).catch(() => {
								selectMsg.edit(embed.setTitle("Song selection cancelled").setDescription("").setFooter(""));
							});
						});
					}
				} else if (args[0].toLowerCase() == "stop") {
					if (!msg.member.voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
					if (!queue) {
						if (msg.guild.voiceConnection) return msg.guild.voiceConnection.channel.leave();
						else return msg.channel.send(client.lang.voiceNothingPlaying(msg));
					}
					if (queue.stop(queue)[0]) return;
				} else if (args[0].toLowerCase() == "queue" || args[0].toLowerCase() == "q") {
					if (!queue) return msg.channel.send(client.lang.voiceNothingPlaying(msg));
					let totalLength = "\nTotal length: "+prettySeconds(queue.songs.reduce((p,c) => (p+parseInt(c.source == "YouTube" ? c.basic.length_seconds : 0)), 0)); //TODO: move this to the song object
					let body = queue.songs.map((songss, index) => `${index+1}. **${songss.title}** (${prettySeconds(songss.source == "YouTube" ? songss.basic.length_seconds: "LIVE")})`).join('\n');
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
					if (!msg.member.voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(client.lang.voiceNothingPlaying(msg));
					if (queue.skip()[0]) return;
				} else if (args[0].toLowerCase() == "auto") {
					if (!msg.member.voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(client.lang.voiceNothingPlaying(msg));
					queue.auto = !queue.auto;
					return msg.channel.send(`Auto mode is now turned ${queue.auto ? "on" : "off"}`);
				} else if (args[0].toLowerCase() == "volume" || args[0].toLowerCase() == "v") {
					if (!msg.member.voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(client.lang.voiceNothingPlaying(msg));
					if (!args[1]) return msg.channel.send(`The current volume is: **${queue.volume}**`);
					let setv = Math.floor(parseInt(args[1]));
					if (isNaN(setv)) return msg.channel.send(`${msg.author.username}, you must provide a number between 1 and 5.`);
					if (setv >= 1 && setv <= 5) {
						queue.volume = setv;
						queue.connection.dispatcher.setVolumeLogarithmic(setv / 5);
					} else return msg.channel.send(`${msg.author.username}, you must provide a number between 1 and 5.`);
				} else if (args[0].toLowerCase() == "now" || args[0].toLowerCase() == "n" || args[0].toLowerCase() == "np") {
					if (!queue) return msg.channel.send(client.lang.voiceNothingPlaying(msg));
					let embed = new Discord.RichEmbed()
					.setDescription(`Now playing: **${queue.songs[0].title}**`)
					.addField("­", songProgress(queue.connection.dispatcher, queue))
					.setColor("36393E")
					let n = await msg.channel.send(embed);
					queue.nowPlayingMsg.clearReactions();
					queue.nowPlayingMsg = n;
					queue.generateReactions();
				} else if ("related".startsWith(args[0].toLowerCase())) {
					if (!queue) return msg.channel.send(client.lang.voiceNothingPlaying(msg));
					let mode = args[1];
					let index = parseInt(args[2])-1;
					let related = await queue.songs[0].related();
					if (related[index] && mode && ["p", "i"].includes(mode[0])) {
						let videoID = related[index].id;
						ytdl.getInfo(videoID).then(video => {
							let song = new YouTubeSong(video, !queue || queue.songs.length <= 1);
							return handleSong(song, msg.channel, voiceChannel, mode[0] == "i");
						}).catch(reason => {
							manageYtdlGetInfoErrors(msg, reason, args[1]);
						});
					} else {
						if (related.length) {
							let body = "";
							related.forEach((songss, index) => {
								let toAdd = `${index+1}. **${songss.title}** (${prettySeconds(songss.length_seconds)})\n *— ${songss.author}*\n`;
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
					if (!msg.member.voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(client.lang.voiceNothingPlaying(msg));
					queue.songs = [queue.songs[0]].concat(queue.songs.slice(1).shuffle());
					return;
				} else if (args[0].toLowerCase() == "pause") {
					if (!msg.member.voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(client.lang.voiceNothingPlaying(msg));
					if (queue.pause()[0]) return;
				} else if (args[0].toLowerCase() == "resume") {
					if (!msg.member.voiceChannel) return msg.channel.send(client.lang.voiceMustJoin(msg));
					if (!queue) return msg.channel.send(client.lang.voiceNothingPlaying(msg));
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
								reloadEvent.emit("musicOut", "queues", queueStorage.storage);
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
								return `${s.index}. created ${createdString}, ${s.songs.split("|").length} songs, total length ${prettySeconds(s.length)}`;
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
						return msg.channel.send(new Discord.RichEmbed().setTitle("Available playlists").setDescription(playlists.map(p => p.name).join("\n")));
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(client.lang.playlistNotOwned(msg));
						let videoID = args[3];
						if (!videoID) return msg.channel.send(`${msg.author.username}, You must provide a YouTube link`);
						ytdl.getInfo(videoID).then(async video => {
							if (orderedSongs.some(row => row.videoID == video.video_id)) return msg.channel.send(client.lang.playlistDuplicateItem(msg));
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(client.lang.playlistNotOwned(msg));
						let index = parseInt(args[3]);
						if (!index) return msg.channel.send(`${msg.author.username}, Please provide the index of the item to remove`);
						index = index-1;
						if (!orderedSongs[index]) return msg.channel.send(client.lang.genericIndexOutOfRange(msg));
						let toRemove = orderedSongs[index];
						await Promise.all([
							utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [toRemove.next, toRemove.playlistID, toRemove.videoID]),
							utils.sql.all("DELETE FROM PlaylistSongs WHERE playlistID = ? AND videoID = ?", [playlistRow.playlistID, toRemove.videoID])
						]);
						return msg.channel.send(`${msg.author.username}, Removed **${toRemove.name}** from playlist **${playlistName}**`);
					} else if (action.toLowerCase() == "move") {
						if (playlistRow.author != msg.author.id) return msg.channel.send(client.lang.playlistNotOwned(msg));
						let from = parseInt(args[3]);
						let to = parseInt(args[4]);
						if (!from || !to) return msg.channel.send(`${msg.author.username}, Please provide an index to move from and an index to move to.`);
						from--; to--;
						if (!orderedSongs[from]) return msg.channel.send(client.lang.genericIndexOutOfRange(msg));
						if (!orderedSongs[to]) return msg.channel.send(client.lang.genericIndexOutOfRange(msg));
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
							.map((songss, index) => `${index+1}. **${songss.name}** (${prettySeconds(songss.length)})`)
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(client.lang.playlistNotOwned(msg));
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(client.lang.playlistNotOwned(msg));
						(await msg.channel.send(new Discord.RichEmbed().setColor("dd1d1d").setDescription(
							"This action will permanently delete the playlist `"+playlistRow.name+"`. "+
							"After deletion, you will not be able to play, display, or modify the playlist, and anyone will be able to create a new playlist with the same name.\n"+
							"You will not be able to undo this action.\n\n"+
							"<:bn_del:331164186790854656> - confirm deletion\n"+
							"<:bn_ti:327986149203116032> - ignore"
						))).reactionMenu([
							{emoji: client.emojis.get(client.parseEmoji("<:bn_del:331164186790854656>").id), allowedUsers: [msg.author.id], ignore: "total", actionType: "js", actionData: async () => {
								await Promise.all([
									utils.sql.all("DELETE FROM Playlists WHERE playlistID = ?", playlistRow.playlistID),
									utils.sql.all("DELETE FROM PlaylistSongs WHERE playlistID = ?", playlistRow.playlistID)
								]);
								msg.channel.send("Playlist deleted.");
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
						let totalLength = "\nTotal length: "+prettySeconds(orderedSongs.reduce((p,c) => (p+parseInt(c.length)), 0));
						let body = orderedSongs.map((songss, index) => `${index+1}. **${songss.name}** (${prettySeconds(songss.length)})`).join('\n');
						if (body.length+totalLength.length > 2000) {
							let first = body.slice(0, 995-totalLength.length/2).split("\n").slice(0, -1).join("\n");
							let last = body.slice(totalLength.length/2-995).split("\n").slice(1).join("\n");
							body = first+"\n…\n"+last;
						}
						body += totalLength;
						let embed = new Discord.RichEmbed()
						.setAuthor(author[0], author[1])
						//.setDescription(orderedSongs.map((row, index) => `${index+1}. **${row.name}** (${prettySeconds(row.length)})`).join("\n")+"\nTotal length: "+prettySeconds(totalLength))
						.setDescription(body)
						.setColor("36393E")
						msg.channel.send(embed);
					}
				} else return msg.channel.send(client.lang.genericInvalidAction(msg));
			}
		}
	}
}
