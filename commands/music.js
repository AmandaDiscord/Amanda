let ytdl = require("ytdl-core");
let YouTube = require('simple-youtube-api');
let queues = new Map();
let timeout = new Set();
let crypto = require("crypto");
let rp = require("request-promise");

module.exports = function(passthrough) {
	let { config, Discord, client, utils, reloadEvent } = passthrough;
	let youtube = new YouTube(config.yt_api_key);

	reloadEvent.on("music", musicCommandListener);
	reloadEvent.once(__filename, () => {
		reloadEvent.removeListener("music", musicCommandListener);
	});
	function musicCommandListener(action) {
		if (action == "getQueues") {
			reloadEvent.emit("musicOut", "queues", queues);
		} else if (["skip", "stop", "pause", "resume"].includes(action)) {
			let [serverID, callback] = [...arguments].slice(1);
			const actions = {
				skip: callskip,
				stop: callstop,
				pause: callpause,
				resume: callresume
			};
			let queue = queues.get(serverID);
			if (!queue) return callback([400, "Server is not playing music"]);
			if (actions[action]) {
				let result = actions[action](undefined, queue);
				if (result) callback([200, result]);
				else callback([204, ""]);
			} else {
				callback([400, "Action does not exist"]);
			}
		}
	}

	function callskip(msg, queue) {
		if (!queue) {
			if (msg) return msg.channel.send(`There aren't any songs to skip`);
			else return "There aren't any songs to skip";
		}
		if (!queue.connection || !queue.connection.dispatcher) return;
		if (!queue.skippable || !queue.connection || !queue.connection.dispatcher) {
			if (msg) return msg.channel.send(`You cannot skip a song before the next has started! Wait a moment and try again.`);
			else return "You cannot skip a song before the next has started! Wait a moment and try again.";
		}
		queue.connection.dispatcher.end();
		reloadEvent.emit("musicOut", "queues", queues);
	}

	function callstop(msg, queue) {
		if (!queue) {
			if (msg) return msg.channel.send('There is nothing playing to stop');
			else return "There is nothing playing to stop";
		}
		if (!queue.connection || !queue.connection.dispatcher) return;
		queue.songs = [];
		queue.connection.dispatcher.end();
		reloadEvent.emit("musicOut", "queues", queues);
	}

	function callpause(msg, queue) {
		if (!queue.connection || !queue.connection.dispatcher) return;
		if (queue && queue.playing) {
			queue.playing = false;
			queue.connection.dispatcher.pause();
			queue.nowPlayingMsg.edit(getNPEmbed(queue.connection.dispatcher, queue));
			reloadEvent.emit("musicOut", "queues", queues);
		} else return;
	}

	function callresume(msg, queue) {
		if (!queue.connection || !queue.connection.dispatcher) return;
		if (queue && !queue.playing) {
			queue.playing = true;
			queue.connection.dispatcher.resume();
			queue.nowPlayingMsg.edit(getNPEmbed(queue.connection.dispatcher, queue));
			reloadEvent.emit("musicOut", "queues", queues);
		} else return;
	}

	function getNPEmbed(dispatcher, queue) {
		let song = queue.songs[0];
		return new Discord.RichEmbed().setColor("36393E")
		.setDescription(`Now playing: **${song.title}**`)
		.addField("­", songProgress(dispatcher, queue, !queue.connection.dispatcher));
	}

	async function handleVideo(video, msg, voiceChannel, ignoreTimeout, playlist, insert) {
		const queue = queues.get(msg.guild.id);
		const song = {
			title: Discord.Util.escapeMarkdown(video.title),
			url: video.video_url,
			video: video
		};
		if (!queue) {
			const queueConstruct = {
				textChannel: msg.channel,
				voiceChannel: voiceChannel,
				connection: null,
				songs: [],
				volume: 5,
				playing: true,
				skippable: false,
				nowPlayingMsg: null,
				generateReactions: function() {
					this.nowPlayingMsg.reactionMenu([
						{ emoji: "⏯", remove: "user", allowedUsers: voiceChannel.members.map(m => m.id), actionType: "js", actionData: (msg) => {
							if (this.playing) callpause(msg, this);
							else callresume(msg, this);
						}},
						{ emoji: "⏭", remove: "user", allowedUsers: voiceChannel.members.map(m => m.id),  actionType: "js", actionData: (msg, emoji, user, messageReaction) => {
							if (callskip(msg, this)) {
								if (this.songs.length == 2) messageReaction.remove();
							}
						}},
						{ emoji: "⏹", remove: "all", allowedUsers: voiceChannel.members.map(m => m.id), ignore: "total", actionType: "js", actionData: (msg) => {
							callstop(msg, this);
						}}
					]);
				}
			};
			queues.set(msg.guild.id, queueConstruct);
			if (timeout.has(msg.guild.id)) return;
			queueConstruct.songs.push(song);
			timeout.add(msg.guild.id);
			setTimeout(() => timeout.delete(msg.guild.id), 1000);
			let connection;
			try {
				connection = await voiceChannel.join();
				queueConstruct.connection = connection;
				play(msg, msg.guild, queueConstruct.songs[0]);
			} catch (error) {
				queues.delete(msg.guild.id);
				return msg.channel.send(`I could not join the voice channel: ${error}`);
			}
		} else {
			if (timeout.has(msg.guild.id) && !ignoreTimeout) return;
			if (insert) queue.songs.splice(1, 0, song);
			else queue.songs.push(song);
			timeout.add(msg.guild.id);
			setTimeout(() => timeout.delete(msg.guild.id), 1000)
			if (playlist) return;
			else return msg.react("👌");
		}
	}

	function play(msg, guild, song) {
		const queue = queues.get(guild.id);
		if (!song) {
			queue.voiceChannel.leave();
			queue.nowPlayingMsg.clearReactions();
			queues.delete(guild.id);
			reloadEvent.emit("musicOut", "queues", queues);
			return msg.channel.send(`We've run out of songs`)
		}
		reloadEvent.emit("musicOut", "queues", queues);
		const stream = ytdl(song.url);
		//console.log("Waiting for response");
		stream.once("progress", () => {
			//console.log("Progress");
			const dispatcher = queue.connection.playStream(stream);
			dispatcher.once("start", async () => {
				queue.skippable = true;
				reloadEvent.emit("musicOut", "queues", queues);
				//console.log("Dispatcher start");
				let dispatcherEndCode = new Function();
				function updateProgress() {
					if (queue.songs[0]) return queue.nowPlayingMsg.edit(getNPEmbed(dispatcher, queue));
					else return Promise.resolve();
				}
				if (!queue.nowPlayingMsg) {
					await msg.channel.send(getNPEmbed(dispatcher, queue)).then(n => queue.nowPlayingMsg = n);
					queue.generateReactions();
				} else {
					await updateProgress();
				}
				let npStartTimeout = setTimeout(() => {
					if (!queue.songs[0] || !queue.connection.dispatcher) return;
					updateProgress();
					let updateProgressInterval = setInterval(() => {
						updateProgress();
					}, 5000);
					//console.log("setTimeout dispatcher event ready");
					dispatcherEndCode = () => {
						//console.log("setTimeout dispatcher end");
						clearInterval(updateProgressInterval);
						updateProgress();
					};
				}, 5000-dispatcher.time%5000);
				function handleError(error) { console.error(error) };
				dispatcher.on('error', handleError);
				dispatcher.once("end", () => {
					dispatcher.removeListener("error", handleError);
					clearTimeout(npStartTimeout);
					dispatcherEndCode();
					queue.skippable = false;
					queue.songs.shift();
					play(msg, guild, queue.songs[0]);
				});
			});
			dispatcher.setVolumeLogarithmic(queue.volume / 5);
			dispatcher.setBitrate("auto");
		});
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
							progressMessage.edit(getProgressMessage(batchNumber, batchProgress, batch.length)).then(() => {;
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
					handleVideo(videos.shift(), msg, voiceChannel).then(() => {
						videos.forEach(video => handleVideo(video, msg, voiceChannel, true, true));
					});
				}
			}).catch(reject);
		})();
	}

	function manageYtdlGetInfoErrors(msg, reason, id) {
		let idString = id ? ` (id: ${id})` : "";
		if (reason.message && reason.message.startsWith("No video id found:")) {
			return msg.channel.send(`${msg.author.username}, that is not a valid YouTube video.`+idString);
		} else if (reason.message && reason.message.includes("who has blocked it in your country")) {
			return msg.channel.send(`${msg.author.username}, that video contains content from overly eager copyright enforcers, who have blocked me from streaming it.`+idString)
		} else if (reason.message && (reason.message.startsWith("The uploader has not made this video available in your country") || reason.message.includes("not available"))) {
			return msg.channel.send(`${msg.author.username}, that video is not available.`+idString);
		} else {
			return new Promise(resolve => {
				utils.stringify(reason).then(result => {
					msg.channel.send(result).then(resolve);
				});
			});
		}
	}

	function prettySeconds(seconds) {
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
		let max = queue.songs[0].video.length_seconds;
		let current = Math.floor(dispatcher.time/1000);
		if (current > max || done) current = max;
		return `\`[ ${prettySeconds(current)} ${utils.progressBar(35, current, max, dispatcher.paused ? " [PAUSED] " : "")} ${prettySeconds(max)} ]\``;
	}

	return {
		"musictoken": {
			usage: "",
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
					`You can find the music dashboard at https://amandabot.ga/dash.`);
			}
		},
		"music": {
			usage: "",
			description: "See `&commands music` for help",
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
				let queue = queues.get(msg.guild.id);
				const voiceChannel = msg.member.voiceChannel;
				if (args[0].toLowerCase() == "play" || args[0].toLowerCase() == "insert" || args[0].toLowerCase() == "p") {
					if (!voiceChannel) return msg.channel.send(`**${msg.author.username}**, you are currently not in a voice channel`);
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to connect to the voice cahnnel you are in`);
					if (!permissions.has("SPEAK")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to speak in that voice channel`);
					if (!args[1]) return msg.channel.send(`${msg.author.username}, please provide either a YouTube video link or some words for me to search for`);
					args[1] = args[1].replace(/^<|>$/g, "");
					if (args[1].match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
						let playlist = await youtube.getPlaylist(args[1]);
						let videos = await playlist.getVideos();
						bulkPlaySongs(msg, voiceChannel, videos.map(video => video.id), args[2], args[3]);
					} else {
						ytdl.getInfo(args[1]).then(video => {
							handleVideo(video, msg, voiceChannel, false, false, args[0].toLowerCase() == "insert");
						}).catch(async reason => {
							let searchString = args.slice(1).join(" ");
							msg.channel.sendTyping();
							let videos = JSON.parse(await rp(`https://invidio.us/api/v1/search?order=relevance&q=${searchString}`));
							if (!videos.length) return msg.channel.send("No videos were found with those search terms");
							videos = videos.slice(0, 10);
							let videoResults = videos.map((video, index) => `${index+1}. **${video.title}** (${prettySeconds(video.lengthSeconds)})`);
							let embed = new Discord.RichEmbed()
								.setTitle("Song selection")
								.setDescription(videoResults.join("\n"))
								.setFooter(`Type a number from 1-${videos.length} to queue that item.`)
								.setColor("36393E")
							let selectMsg = await msg.channel.send({embed});
							let collector = msg.channel.createMessageCollector((m => m.author.id == msg.author.id), {maxMatches: 1, time: 60000});
							collector.next.then(async msg => {
								let videoIndex = parseInt(msg.content);
								if (!videoIndex || !videos[videoIndex-1]) return Promise.reject();
								ytdl.getInfo(videos[videoIndex-1].videoId).then(video => {
									handleVideo(video, msg, voiceChannel, false, false, args[0].toLowerCase() == "insert");
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
					callstop(msg, queue);
					return msg.react("👌");
				} else if (args[0].toLowerCase() == "queue" || args[0].toLowerCase() == "q") {
					if (!queue) return msg.channel.send(`There aren't any songs queued`);
					let totalLength = "\nTotal length: "+prettySeconds(queue.songs.reduce((p,c) => (p+parseInt(c.video.length_seconds)), 0));
					let body = queue.songs.map((songss, index) => `${index+1}. **${songss.title}** (${prettySeconds(songss.video.length_seconds)})`).join('\n');
					if (body.length > 2000) {
						let first = body.slice(0, 995-totalLength.length/2).split("\n").slice(0, -1).join("\n");
						let last = body.slice(totalLength.length/2-995).split("\n").slice(1).join("\n");
						body = first+"\n…\n"+last;
					}
					const embed = new Discord.RichEmbed()
					.setAuthor(`Queue for ${msg.guild.name}`)
					.setDescription(body+totalLength)
					.setColor("36393E")
					return msg.channel.send({embed});
				} else if (args[0].toLowerCase() == "skip" || args[0].toLowerCase() == "s") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					callskip(msg, queue);
					return msg.react("👌");
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
					const embed = new Discord.RichEmbed()
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
							handleVideo(video, msg, voiceChannel, false, false, mode[0] == "i");
						}).catch(reason => {
							manageYtdlGetInfoErrors(msg, reason, args[1]);
						});
					} else {
						let body = "";
						related.forEach((songss, index) => {
							let toAdd = `${index+1}. **${songss.title}** (${prettySeconds(songss.length_seconds)})\n *— ${songss.author}*\n`;
							if (body.length + toAdd.length < 2000) body += toAdd;
						});
						const embed = new Discord.RichEmbed()
						.setAuthor(`Related videos`)
						.setDescription(body)
						.setFooter(`Use "&music related <play|insert> <index>" to queue an item from this list.`)
						.setColor("36393E")
						return msg.channel.send(embed);
					}
				} else if (args[0].toLowerCase() == "shuffle") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send('There is nothing queued to shuffle');
					queue.songs = [queue.songs[0]].concat(queue.songs.slice(1).shuffle());
					return msg.react("👌");
				} else if (args[0].toLowerCase() == "pause") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					callpause(msg, queue);
					return msg.react("👌");
				} else if (args[0].toLowerCase() == "resume") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					callresume(msg, queue);
					return msg.react("👌");
				} else if (args[0].match(/^pl(aylists?)?$/)) {
					let playlistName = args[1];
					if (!playlistName) return msg.channel.send(`${msg.author.username}, You must name a playlist`);
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(`${msg.author.username}, You do not own that playlist and cannot modify it.`);
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(`${msg.author.username}, You do not own that playlist and cannot modify it.`);
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(`${msg.author.username}, You do not own that playlist and cannot modify it.`);
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
						if (playlistRow.author != msg.author.id) return msg.channel.send(`${msg.author.username}, You do not own that playlist and cannot modify it.`);
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
