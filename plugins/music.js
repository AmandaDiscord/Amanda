const ytdl = require("ytdl-core");
const Discord = require("discord.js");
const YouTube = require('simple-youtube-api');
const youtube = new YouTube("AIzaSyCSazLCS6oulNlmWC7NtDgoNJCWEp5O0MY");
const queues = new Map();
const timeout = new Set();

module.exports = function(passthrough) {
	const { Discord, djs, dio, utils, dbs } = passthrough;
	let sql = dbs[1];

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
				skippable: false
			};
			queues.set(msg.guild.id, queueConstruct);
			if (timeout.has(msg.guild.id)) return;
			queueConstruct.songs.push(song);
			timeout.add(msg.guild.id);
			setTimeout(() => timeout.delete(msg.guild.id), 1000)
			try {
				var connection = await voiceChannel.join();
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
			queues.delete(guild.id);
			return msg.channel.send(`We've run out of songs`)
		}
		const stream = ytdl(song.url);
		//console.log("Waiting for response");
		stream.once("progress", () => {
			//console.log("Progress");
			const dispatcher = queue.connection.playStream(stream);
			dispatcher.once("start", () => {
				queue.skippable = true;
				//console.log("Dispatcher start");
				function getNPEmbed() {
					return new Discord.RichEmbed().setColor("36393E")
					.setDescription(`Now playing: **${song.title}**`)
					.addField("­", songProgress(dispatcher, queue, !queue.connection.dispatcher));
				}
				let dispatcherEndCode = new Function();
				msg.channel.send(getNPEmbed()).then(npmsg => {
					if (!queue.songs[0] || !queue.connection.dispatcher) return;
					setTimeout(() => {
						if (!queue.songs[0] || !queue.connection.dispatcher) return;
						function updateProgress() {
							if (queue.songs[0]) npmsg.edit(getNPEmbed());
						}
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
				});
				dispatcher.on("end", () => {
					dispatcherEndCode();
					//console.log("Dispatcher end");
					queue.skippable = false;
					queue.songs.shift();
					play(msg, guild, queue.songs[0]);
				});
			});
			dispatcher.on('error', error => console.error(error));
			dispatcher.setVolumeLogarithmic(queue.volume / 5);
		});
	}

	async function bulkPlaySongs(msg, voiceChannel, videoIDs, startString, endString, shuffle) {
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
		const getProgressMessage = () => `Please wait, loading songs (${progress}/${videoIDs.length})`;
		let lastEdit = 0;
		let editInProgress = false;
		let progressMessage = await msg.channel.send(getProgressMessage());
		Promise.all(videoIDs.map(videoID => {
			return new Promise((resolve, reject) => {
				ytdl.getInfo(videoID).then(info => {
					progress++;
					if ((Date.now()-lastEdit > 2000 && !editInProgress) || progress == videoIDs.length) {
						lastEdit = Date.now();
						editInProgress = true;
						progressMessage.edit(getProgressMessage()).then(() => {;
							editInProgress = false;
						});
					}
					resolve(info);
				}).catch(reject);
			});
		})).then(videos => {
			videos = videos.filter(v => v);
			handleVideo(videos.shift(), msg, voiceChannel).then(() => {
				videos.forEach(video => handleVideo(video, msg, voiceChannel, true, true));
			});
		}).catch(reason => {
			manageYtdlGetInfoErrors(msg, reason);
		});
	}

	function manageYtdlGetInfoErrors(msg, reason) {
		if (reason.message && reason.message.startsWith("No video id found:")) {
			msg.channel.send(`${msg.author.username}, that is not a valid YouTube video.`);
		} else if (reason.message && reason.message.includes("who has blocked it in your country")) {
			msg.channel.send(`${msg.author.username}, that video contains content from overly eager copyright enforcers, who have blocked me from streaming it.`)
		} else if (reason.message && reason.message.startsWith("The uploader has not made this video available in your country")) {
			msg.channel.send(`${msg.author.username}, that video is not available.`);
		} else {
			utils.stringify(reason).then(result => msg.channel.send(result));
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
		return `\`[ ${prettySeconds(current)} ${utils.progressBar(35, current, max)} ${prettySeconds(max)} ]\``;
	}

	return {
		"music": {
			usage: "Null",
			description: "See `&commands music` for help",
			aliases: ["music", "m"],
			process: async function(msg, suffix) {
				if (msg.channel.type != "text") return msg.channel.send(`${msg.author.username}, you cannot use this command in DMs`);
				let allowed = (await Promise.all([utils.hasPermission(msg.author, "music"), utils.hasPermission(msg.guild, "music")])).includes(true);
				if (!allowed) return msg.channel.send(`${msg.author.username}, you or this guild is not part of the partner system. Information can be obtained by DMing PapiOphidian#8685`);
				var args = suffix.split(" ");
				let queue = queues.get(msg.guild.id);
				const voiceChannel = msg.member.voiceChannel;
				if (args[0].toLowerCase() == "play" || args[0].toLowerCase() == "insert" || args[0].toLowerCase() == "p") {
					if (!voiceChannel) return msg.channel.send(`**${msg.author.username}**, you are currently not in a voice channel`);
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to connect to the voice cahnnel you are in`);
					if (!permissions.has("SPEAK")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to speak in that voice channel`);
					if (!args[1]) return msg.channel.send(`${msg.author.username}, you need to provide a valid youtube link as an argument to the play sub-command`);
					args[1] = args[1].replace(/^<|>$/g, "");
					if (args[1].match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
						let playlist = await youtube.getPlaylist(args[1]);
						let videos = await playlist.getVideos();
						bulkPlaySongs(msg, voiceChannel, videos.map(video => video.id), args[2], args[3]);
					} else {
						ytdl.getInfo(args[1]).then(video => {
							handleVideo(video, msg, voiceChannel, false, false, args[0].toLowerCase() == "insert");
						}).catch(reason => {
							manageYtdlGetInfoErrors(msg, reason);
						});
					}
				} else if (args[0].toLowerCase() == "stop") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send('There is nothing playing to stop');
					queue.songs = [];
					return queue.connection.dispatcher.end();
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
					if (!voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send(`There aren't any songs to skip`);
					if (!queue.skippable || !queue.connection || !queue.connection.dispatcher) return msg.channel.send(`${msg.author.username}, You cannot skip a song before the next has started! Wait a moment and try again.`);
					queue.connection.dispatcher.end();
					msg.react("👌");
				} else if (args[0].toLowerCase() == "volume" || args[0].toLowerCase() == "v") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send('There is nothing playing.');
					if (!args[1]) return msg.channel.send(`The current volume is: **${queue.volume}**`);
					var setv = Math.floor(parseInt(args[1]));
					if (isNaN(setv)) return msg.channel.send(`${msg.author.username}, that is not a valid number to set the volume to`);
					if (setv > 0 && setv < 6) {
						queue.volume = setv;
						queue.connection.dispatcher.setVolumeLogarithmic(setv / 5);
						return msg.react("👌");
					} else return msg.channel.send(`${msg.author.username}, you must provide a number greater than 0 or less than or equal to 5`);
				} else if (args[0].toLowerCase() == "now" || args[0].toLowerCase() == "n") {
					if (!queue) return msg.channel.send('There is nothing playing.');
					const embed = new Discord.RichEmbed()
					.setDescription(`Now playing: **${queue.songs[0].title}**`)
					.addField("­", songProgress(queue.connection.dispatcher, queue))
					.setColor("36393E")
					return msg.channel.send({embed});
				} else if (args[0].toLowerCase() == "shuffle") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send('There is nothing queued to shuffle');
					queue.songs = [queue.songs[0]].concat(queue.songs.slice(1).shuffle());
					return msg.react("👌");
				} else if (args[0].toLowerCase() == "pause") {
					if (queue && queue.playing) {
						queue.playing = false;
						queue.connection.dispatcher.pause();
						return msg.react("👌");
					} else return msg.channel.send(`There is nothing playing to pause`);
				} else if (args[0].toLowerCase() == "resume") {
					if (queue && !queue.playing) {
						queue.playing = true;
						queue.connection.dispatcher.resume();
						return msg.react("👌");
					} else return msg.channel.send(`There is nothing in the queue to resume`);
				} else if (args[0].match(/^pl(aylists?)?$/)) {
					let playlistName = args[1];
					if (!playlistName) return msg.channel.send(`${msg.author.username}, You must name a playlist`);
					let playlistRow = await sql.get("SELECT * FROM Playlists WHERE name = ?", playlistName);
					if (!playlistRow) {
						if (args[2] == "create") {
							await sql.run("INSERT INTO Playlists VALUES (NULL, ?, ?)", [msg.author.id, playlistName]);
							return msg.channel.send(`${msg.author.username}, Created playlist **${playlistName}**`);
						} else {
							return msg.channel.send(`${msg.author.username}, That playlist does not exist. Use \`&music playlist ${playlistName} create\` to create it.`);
						}
					}
					let songs = await sql.all("SELECT * FROM PlaylistSongs INNER JOIN Songs ON Songs.videoID = PlaylistSongs.videoID WHERE playlistID = ?", playlistRow.playlistID);
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
						await sql.run("BEGIN TRANSACTION");
						await Promise.all(songs.map((row, index) => {
							return sql.run("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [(songs[index+1] ? songs[index+1].videoID : null), row.playlistID, row.videoID]);
						}));
						await sql.run("END TRANSACTION");
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
								sql.run("INSERT INTO Songs SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM Songs WHERE videoID = ?)", [video.video_id, video.title, video.length_seconds, video.video_id]),
								sql.run("INSERT INTO PlaylistSongs VALUES (?, ?, NULL)", [playlistRow.playlistID, video.video_id]),
								sql.run("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next IS NULL AND videoID != ?", [video.video_id, playlistRow.playlistID, video.video_id])
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
							sql.run("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [toRemove.next, toRemove.playlistID, toRemove.videoID]),
							sql.run("DELETE FROM PlaylistSongs WHERE playlistID = ? AND videoID = ?", [playlistRow.playlistID, toRemove.videoID])
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
							await sql.run("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [fromRow.next, fromRow.playlistID, fromRow.videoID]); // update row before item
							await sql.run("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [toRow.next, fromRow.playlistID, fromRow.videoID]); // update moved item
							await sql.run("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [fromRow.videoID, fromRow.playlistID, toRow.videoID]); // update row before moved item
						} else if (from > to) {
							await sql.run("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [fromRow.next, fromRow.playlistID, fromRow.videoID]); // update row before item
							await sql.run("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [fromRow.videoID, fromRow.playlistID, toRow.videoID]); // update row before moved item
							await sql.run("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [toRow.videoID, fromRow.playlistID, fromRow.videoID]); // update moved item
						} else {
							return msg.channel.send(`${msg.author.username}, Those two indexes are equal.`);
						}
						return msg.channel.send(`${msg.author.username}, Moved **${fromRow.name}** to position **${to+1}**`);
					} else if (action.toLowerCase() == "search" || action.toLowerCase() == "find") {

					} else if (action.toLowerCase() == "play" || action.toLowerCase() == "shuffle") {
						bulkPlaySongs(msg, voiceChannel, orderedSongs.map(song => song.videoID), args[3], args[4], action.toLowerCase() == "shuffle");
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
								promises.push(sql.run(
									"INSERT INTO Songs SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM Songs WHERE videoID = ?)",
									[video.video_id, video.title, video.length_seconds, video.video_id]
								));
								if (i != videos.length-1) {
									let nextVideo = videos[i+1];
									promises.push(sql.run(
										"INSERT INTO PlaylistSongs VALUES (?, ?, ?)",
										[playlistRow.playlistID, video.video_id, nextVideo.video_id]
									));
								} else {
									promises.push(sql.run(
										"INSERT INTO PlaylistSongs VALUES (?, ?, NULL)",
										[playlistRow.playlistID, video.video_id]
									));
								}
							}
							promises.push(sql.run(
								"UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next IS NULL AND videoID != ?",
								[videos[0].video_id, playlistRow.playlistID, videos.slice(-1)[0].video_id]
							));
							await Promise.all(promises);
							editmsg.edit(`All done! Check out your playlist with **&music playlist ${playlistName}**.`);
						} else return msg.channel.send(`${msg.author.username}, please provide a YouTube playlist link.`);
					} else {
						let author = [];
						if (djs.users.get(playlistRow.author)) {
							author.push(`${djs.users.get(playlistRow.author).username} — ${playlistName}`, `https://cdn.discordapp.com/avatars/${djs.users.get(playlistRow.author).id}/${djs.users.get(playlistRow.author).avatar}.png?size=32`);
						} else {
							author.push(playlistName);
						}
						let totalLength = "\nTotal length: "+prettySeconds(orderedSongs.reduce((p,c) => (p+parseInt(c.length)), 0));
						let body = orderedSongs.map((songss, index) => `${index+1}. **${songss.name}** (${prettySeconds(songss.length)})`).join('\n');
						if (body.length > 2000) {
							let first = body.slice(0, 995-totalLength.length/2).split("\n").slice(0, -1).join("\n");
							let last = body.slice(totalLength.length/2-995).split("\n").slice(1).join("\n");
							body = first+"\n…\n"+last;
						}
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
