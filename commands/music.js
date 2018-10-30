let ytdl = require("ytdl-core");
let YouTube = require('simple-youtube-api');
const net = require("net");
let crypto = require("crypto");
let rp = require("request-promise");

const voiceEmptyDuration = 20000;

module.exports = function(passthrough) {
	let { config, Discord, client, utils, reloadEvent } = passthrough;
	let youtube = new YouTube(config.yt_api_key);
	let queueStorage = utils.queueStorage;

	class Song {
		constructor(title, source, live) {
			this.title = title;
			this.source = source;
			this.live = live;
			this.streaming = false;
		}
		toObject() {
			return Object.assign({
				title: this.title,
				source: this.source,
				live: this.live
			}, this.object());
		}
		object() {
			// Intentionally empty. Subclasses should put additional properties for toObject here.
		}
		getStream() {
			this.streaming = true;
			return this.stream();
		}
	}

	async function YTSongObjectFromURL(url, cache) {
		let info = await ytdl.getInfo(url);
		return new YouTubeSong(info, cache);
	}
	class YouTubeSong extends Song {
		constructor(info, cache) {
			super(info.title, "YouTube", false);
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
		async stream() {
			if (this.info) return ytdl.downloadFromInfo(this.info);
			else return ytdl.getInfo(this.basic.id).then(() => ytdl(this.url));
		}
		getInfo(cache) {
			if (this.info) return Promise.resolve(info);
			else {
				return ytdl.getInfo(this.basic.id).then(() => {
					if (cache) this.info = info;
					return Promise.resolve();
				});
			}
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
			if (this.connection.dispatcher) this.connection.dispatcher.end();
			this.voiceChannel.leave();
			if (this.nowPlayingMsg) this.nowPlayingMsg.clearReactions();
			this.destroy();
		}
		destroy() {
			this.queueStorage.storage.delete(this.id);
		}
		addSong(song, position) {
			if (position == null) this.songs.push(song);
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
			return new Discord.RichEmbed().setColor("36393E")
			.setDescription(`Now playing: **${song.title}**`)
			.addField("­", songProgress(this.dispatcher, this, !this.connection.dispatcher)+(this.auto ? "\n\n**Auto mode on.**" : ""));
		}
		generateReactions() {
			if (this.nowPlayingMsg) this.nowPlayingMsg.reactionMenu([
				{ emoji: "⏯", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
					if (!this.voiceChannel.members.has(user.id)) return;
					if (this.playing) this.pause();
					else this.resume();
				}},
				{ emoji: "⏭", remove: "user", actionType: "js", actionData: (msg, emoji, user, messageReaction) => {
					if (!this.voiceChannel.members.has(user.id)) return;
					if (this.skip()[0]) {
						if (this.songs.length == 2) messageReaction.remove();
					}
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
			const dispatcher = this.connection.playStream(stream);
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
					return [false, "The current queue cannot be paused at this time."];
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
					return [false, "The current queue cannot be resumed at this time."];
				}
			})(web);
		}
		skip(web) {
			return this.queueAction(() => {
				if (this.connection && this.connection.dispatcher && this.playing) {
					this.connection.dispatcher.end();
					return [true];
				} else if (!this.playing) {
					return [false, "You cannot skip a song before it has started! Wait a moment and try again."];
				} else {
					return [false, "The current queue cannot be skipped at this time."];
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

	async function handleSong(song, textChannel, voiceChannel) {
		let queue = queueStorage.storage.get(textChannel.guild.id) || new Queue(textChannel, voiceChannel);
		queue.addSong(song);
	}

	async function bulkPlaySongs(msg, voiceChannel, videoIDs, startString, endString, shuffle) {
		const useBatchLimit = 50;
		const batchSize = 30;

		let from = startString == "-" ? 1 : (parseInt(startString) || 1);
		let to = endString == "-" ? videoIDs.length : (parseInt(endString) || from || videoIDs.length);
		from = Math.max(from, 1);
		to = Math.min(videoIDs.length, to);
		if (startString) videoIDs = videoIDs.slice(from-1, to);
		if (shuffle) {
			videoIDs = videoIDs.shuffle();
		}
		if (!voiceChannel) return msg.channel.send(`${msg.author.username}, You must join a voice channel first`);
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
		function reject({reason, id}) {
			manageYtdlGetInfoErrors(msg, reason, id).then(() => {
				msg.channel.send("At least one video in the playlist was not playable. Playlist loading has been cancelled.");
			});
		}
		let batchNumber = 0;
		(function nextBatch() {
			let batch = batches.shift();
			batchNumber++;
			let batchProgress = 0;
			Promise.all(batch.map(videoID => {
				return new Promise((resolve, reject) => {
					ytdl.getInfo(videoID).then(info => {
						progress++;
						batchProgress++;
						if ((Date.now()-lastEdit > 2000 && !editInProgress) || progress == total) {
							lastEdit = Date.now();
							editInProgress = true;
							progressMessage.edit(getProgressMessage(batchNumber, batchProgress, batch.length)).then(() => {
								editInProgress = false;
							});
						}
						resolve(info);
					}).catch(reason => reject({reason, id: videoID}));
				});
			})).then(batchVideos => {
				videos.push(...batchVideos);
				if (batches.length) nextBatch();
				else {
					videos.forEach(video => {
						let queue = queueStorage.storage.get(msg.guild.id);
						let song = new YouTubeSong(video, !queue || queue.songs.length <= 1);
						handleSong(song, msg.channel, voiceChannel);
					});
				}
			}).catch(reject);
		})();
	}

	function manageYtdlGetInfoErrors(channel, reason, id) {
		if (channel.channel) channel = channel.channel;
		let idString = id ? ` (id: ${id})` : "";
		if (reason.message && reason.message.startsWith("No video id found:")) {
			return channel.send(`${msg.author.username}, that is not a valid YouTube video.`+idString);
		} else if (reason.message && reason.message.includes("who has blocked it in your country")) {
			return channel.send(`${msg.author.username}, that video contains content from overly eager copyright enforcers, who have blocked me from streaming it.`+idString)
		} else if (reason.message && (reason.message.startsWith("The uploader has not made this video available in your country") || reason.message.includes("not available"))) {
			return channel.send(`${msg.author.username}, that video is not available.`+idString);
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
				const voiceChannel = msg.member.voiceChannel;
				if (!voiceChannel) return msg.channel.send("Please join a voice channel first!");
				let station = ["frisky", "deep", "chill"].includes(suffix) ? suffix : "frisky";
				let stream = new FriskySong(station);
				handleSong(stream, msg.channel, voiceChannel);
				return msg.react("👌");
			}
		},
		"music": {
			usage: "none",
			description: "You're not supposed to see this",
			aliases: ["music", "m"],
			category: "music",
			process: async function(msg, suffix) {
				if (msg.channel.type != "text") return msg.channel.send(`${msg.author.username}, you cannot use this command in DMs`);
				let allowed = (await Promise.all([utils.hasPermission(msg.author, "music"), utils.hasPermission(msg.guild, "music")])).includes(true);
				if (!allowed) {
					let owner = await client.fetchUser("320067006521147393")
					return msg.channel.send(`${msg.author.username}, you or this guild is not part of the partner system. Information can be obtained by DMing ${owner.tag}`);
				}
				let args = suffix.split(" ");
				let queue = queueStorage.storage.get(msg.guild.id);
				const voiceChannel = msg.member.voiceChannel;
				if (args[0].toLowerCase() == "play" || args[0].toLowerCase() == "insert" || args[0].toLowerCase() == "p") {
					if (!voiceChannel) return msg.channel.send(`**${msg.author.username}**, you are currently not in a voice channel`);
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to connect to the voice channel you are in`);
					if (!permissions.has("SPEAK")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to speak in that voice channel`);
					if (!args[1]) return msg.channel.send(`${msg.author.username}, please provide either a YouTube video link or some words for me to search for`);
					args[1] = args[1].replace(/^<|>$/g, "");
					{
						let match = args[1].match("cadence\.(?:gq|moe)/cloudtube/video/([\\w-]+)");
						if (match) args[1] = match[1];
					}
					if (args[1].match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
						let playlist = await youtube.getPlaylist(args[1]);
						let videos = await playlist.getVideos();
						bulkPlaySongs(msg, voiceChannel, videos.map(video => video.id), args[2], args[3]);
					} else {
						ytdl.getInfo(args[1]).then(video => {
							let song = new YouTubeSong(video, !queue || queue.songs.length <= 1);
							handleSong(song, msg.channel, voiceChannel);
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
							collector.next.then(async msg => {
								let videoIndex = parseInt(msg.content);
								if (!videoIndex || !videos[videoIndex-1]) return Promise.reject();
								ytdl.getInfo(videos[videoIndex-1].videoId).then(video => {
									let song = new YouTubeSong(video, !queue || queue.songs.length <= 1);
									handleSong(song, msg.channel, voiceChannel);
								}).catch(error => manageYtdlGetInfoErrors(msg, error, args[1]));
								//selectMsg.edit(embed.setDescription("").setFooter("").setTitle("").addField("Song selected", videoResults[videoIndex-1]));
								selectMsg.edit(embed.setDescription("» "+videoResults[videoIndex-1]).setFooter(""));
							}).catch(() => {
								selectMsg.edit(embed.setTitle("Song selection cancelled").setDescription("").setFooter(""));
							});
						});
					}
				} else if (args[0].toLowerCase() == "stop") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) {
						if (msg.guild.voiceConnection) return msg.guild.voiceConnection.channel.leave();
						else return msg.channel.send("Nothing is currently playing.");
					}
					if (queue.stop(queue)[0]) return msg.react("👌");
				} else if (args[0].toLowerCase() == "queue" || args[0].toLowerCase() == "q") {
					if (!queue) return msg.channel.send("Nothing is currently playing.");
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
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send("Nothing is currently playing.");
					if (queue.skip()[0]) return msg.react("👌");
				} else if (args[0].toLowerCase() == "auto") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send("Nothing is currently playing.");
					queue.auto = !queue.auto;
					return msg.channel.send(`Auto mode is now turned ${queue.auto ? "on" : "off"}`);
				} else if (args[0].toLowerCase() == "volume" || args[0].toLowerCase() == "v") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send('There is nothing playing.');
					if (!args[1]) return msg.channel.send(`The current volume is: **${queue.volume}**`);
					let setv = Math.floor(parseInt(args[1]));
					if (isNaN(setv)) return msg.channel.send(`${msg.author.username}, that is not a valid number to set the volume to`);
					if (setv > 0 && setv < 6) {
						queue.volume = setv;
						queue.connection.dispatcher.setVolumeLogarithmic(setv / 5);
						return msg.react("👌");
					} else return msg.channel.send(`${msg.author.username}, you must provide a number greater than 0 or less than or equal to 5`);
				} else if (args[0].toLowerCase() == "now" || args[0].toLowerCase() == "n" || args[0].toLowerCase() == "np") {
					if (!queue) return msg.channel.send('There is nothing playing.');
					let embed = new Discord.RichEmbed()
					.setDescription(`Now playing: **${queue.songs[0].title}**`)
					.addField("­", songProgress(queue.connection.dispatcher, queue))
					.setColor("36393E")
					let n = await msg.channel.send(embed);
					queue.nowPlayingMsg.clearReactions();
					queue.nowPlayingMsg = n;
					queue.generateReactions();
				} else if ("related".startsWith(args[0].toLowerCase())) {
					if (!queue) return msg.channel.send('There is nothing playing.');
					let mode = args[1];
					let index = parseInt(args[2])-1;
					let related = queue.songs[0].video.related_videos.filter(v => v.title).slice(0, 10);
					if (related[index] && mode && ["p", "i"].includes(mode[0])) {
						let videoID = related[index].id;
						ytdl.getInfo(videoID).then(video => {
							let song = new YouTubeSong(video, !queue || queue.songs.length <= 1);
							handleSong(song, msg.channel, voiceChannel);
						}).catch(reason => {
							manageYtdlGetInfoErrors(msg, reason, args[1]);
						});
					} else {
						let body = "";
						related.forEach((songss, index) => {
							let toAdd = `${index+1}. **${songss.title}** (${prettySeconds(songss.video.length_seconds)})\n *— ${songss.author}*\n`;
							if (body.length + toAdd.length < 2000) body += toAdd;
						});
						let embed = new Discord.RichEmbed()
						.setAuthor(`Related videos`)
						.setDescription(body)
						.setFooter(`Use "&music related <play|insert> <index>" to queue an item from this list.`)
						.setColor("36393E")
						return msg.channel.send(embed);
					}
				} else if (args[0].toLowerCase() == "shuffle") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send("Nothing is currently playing.");
					queue.songs = [queue.songs[0]].concat(queue.songs.slice(1).shuffle());
					return msg.react("👌");
				} else if (args[0].toLowerCase() == "pause") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send("Nothing is currently playing.");
					if (queue.pause()[0]) return msg.react("👌");
				} else if (args[0].toLowerCase() == "resume") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send("Nothing is currently playing.");
					if (queue.resume()[0]) return msg.react("👌");
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(`${msg.author.username}, you do not own that playlist and cannot modify it.`);
						let videoID = args[3];
						if (!videoID) return msg.channel.send(`${msg.author.username}, You must provide a YouTube link`);
						ytdl.getInfo(videoID).then(async video => {
							if (orderedSongs.some(row => row.videoID == video.video_id)) return msg.channel.send(`${msg.author.username}, That song is already in the playlist.`);
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(`${msg.author.username}, you do not own that playlist and cannot modify it.`);
						let index = parseInt(args[3]);
						if (!index) return msg.channel.send(`${msg.author.username}, Please provide the index of the item to remove`);
						index = index-1;
						if (!orderedSongs[index]) return msg.channel.send(`${msg.author.username}, That index is out of range`);
						let toRemove = orderedSongs[index];
						await Promise.all([
							utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [toRemove.next, toRemove.playlistID, toRemove.videoID]),
							utils.sql.all("DELETE FROM PlaylistSongs WHERE playlistID = ? AND videoID = ?", [playlistRow.playlistID, toRemove.videoID])
						]);
						return msg.channel.send(`${msg.author.username}, Removed **${toRemove.name}** from playlist **${playlistName}**`);
					} else if (action.toLowerCase() == "move") {
						if (playlistRow.author != msg.author.id) return msg.channel.send(`${msg.author.username}, you do not own that playlist and cannot modify it.`);
						let from = parseInt(args[3]);
						let to = parseInt(args[4]);
						if (!from || !to) return msg.channel.send(`${msg.author.username}, Please provide an index to move from and an index to move to.`);
						from--; to--;
						if (!orderedSongs[from]) return msg.channel.send(`${msg.author.username}, That index is out of range`);
						if (!orderedSongs[to]) return msg.channel.send(`${msg.author.username}, That index is out of range`);
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(`${msg.author.username}, you do not own that playlist and cannot modify it.`);
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(`${msg.author.username}, you do not own that playlist and cannot modify it.`);
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
				} else return msg.channel.send(`${msg.author.username}, That's not a valid action to do`);
			}
		}
	}
}
