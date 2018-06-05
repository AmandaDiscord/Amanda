const ytdl = require("ytdl-core");
const Discord = require("discord.js");
const queues = new Map();
const timeout = new Set();

module.exports = function(passthrough) {
	const { Discord, djs, dio, dbs } = passthrough;
	let sql = dbs[1];

	async function handleVideo(video, msg, voiceChannel, ignoreTimeout, playlist = false) {
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
				playing: true
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
			queue.songs.push(song);
			timeout.add(msg.guild.id);
			setTimeout(() => timeout.delete(msg.guild.id), 1000)
			if (playlist) return;
			else return msg.react("👌").catch(() => { return });
		}
	}

	function play(msg, guild, song) {
		const queue = queues.get(guild.id);
		if (!song) {
			queue.voiceChannel.leave();
			queues.delete(guild.id);
			return msg.channel.send(`We've run out of songs`)
		}
		const dispatcher = queue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			queue.songs.shift();
			play(msg, guild, queue.songs[0]);
		})
		.on('error', error => console.error(error));
		dispatcher.setVolumeLogarithmic(queue.volume / 5);
		queue.startedAt = Date.now();

		function getNPEmbed() {
			return new Discord.RichEmbed().setDescription(`Now playing: **${song.title}** (${songProgress(queue)})`);
		}
		msg.channel.send(getNPEmbed()).then(npmsg => {
			setTimeout(() => {
				function updateProgress() {
					npmsg.edit(getNPEmbed()).catch(() => { return });
				}
				updateProgress();
				let updateProgressInterval = setInterval(updateProgress, 5000);
				setTimeout(() => {
					clearInterval(updateProgressInterval);
					updateProgress();
				}, (queue.songs[0].video.length_seconds-(Date.now()-queue.startedAt)/1000)*1000);
			}, 5000-(Date.now()-queue.startedAt)%5000);
		});
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

	function songProgress(queue) {
		if (!queue.songs.length) return "0:00/0:00";
		let max = queue.songs[0].video.length_seconds;
		let current = Math.floor((Date.now()-queue.startedAt)/1000);
		if (current > max) current = max;
		return prettySeconds(current)+"/"+prettySeconds(max);
	}

	return {
		"music": {
			usage: "Null",
			description: "See `&commands music` for help",
			process: async function(msg, suffix) {
				if (msg.channel.type != "text") return msg.channel.send(`${msg.author.username}, you cannot use this command in DMs`);
				if(["434187284477116426", "400034967322624020", "399054909695328277", "357272833824522250", "223247740346302464"].includes(msg.guild.id)) {
					var isPrem = true;
				} else if (["320067006521147393", "366385096053358603", "176580265294954507"].includes(msg.author.id)) {
					var isPrem = true;
				} else {
					var isPrem = false;
				}
				if (isPrem == false) {
					msg.channel.startTyping();
					return setTimeout(() => {
						msg.channel.send(`${msg.author.username}, you or this guild is not apart of the partner system. Information can be obtained by DMing PapiOphidian#8685`).then(() => msg.channel.stopTyping());
					}, 2000)
				}
				var args = suffix.split(" ");
				const queue = queues.get(msg.guild.id);
				const voiceChannel = msg.member.voiceChannel;
				if (args[0].toLowerCase() == "play") {
					if (!voiceChannel) return msg.channel.send(`**${msg.author.username}**, you are currently not in a voice channel`);
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to connect to the voice cahnnel you are in`);
					if (!permissions.has("SPEAK")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to speak in that voice channel`);
					if (!args[1]) return msg.channel.send(`${msg.author.username}, you need to provide a valid youtube link as an argument to the play sub-command`);
					const video = await ytdl.getInfo(args[1]);
					return handleVideo(video, msg, voiceChannel);
				} else if (args[0].toLowerCase() == "stop") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send('There is nothing playing to stop');
					queue.songs = [];
					return queue.connection.dispatcher.end();
				} else if (args[0].toLowerCase() == "queue") {
					if (!queue) return msg.channel.send(`There aren't any songs queued`);
					let index = 0;
					const embed = new Discord.RichEmbed()
					.setAuthor(`Queue for ${msg.guild.name}`)
					.setDescription(queue.songs.map(songss => `${++index}. **${songss.title}** (${prettySeconds(songss.video.length_seconds)})`).join('\n')+"\nTotal length: "+prettySeconds(queue.songs.reduce((p,c) => (p+parseInt(c.video.length_seconds)), 0)))
					return msg.channel.send({embed});
				} else if (args[0].toLowerCase() == "skip") {
					if (!voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send(`There aren't any songs to skip`);
					await queue.connection.dispatcher.end();
					return msg.react("👌").catch(() => { return });
				} else if (args[0].toLowerCase() == "volume") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send('There is nothing playing.');
					if (!args[1]) return msg.channel.send(`The current volume is: **${queue.volume}**`);
					queue.volume = args[1];
					queue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
					return msg.react("👌").catch(() => { return });
				} else if (args[0].toLowerCase() == "now") {
					if (!queue) return msg.channel.send('There is nothing playing.');
					const embed = new Discord.RichEmbed()
					.setDescription(`Now playing: **${queue.songs[0].title}** (${songProgress(queue)})`)
					return msg.channel.send({embed});
				} else if (args[0].toLowerCase() == "playlist") {
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
					} else if (action.toLowerCase() == "play") {
						let from = args[3] == "-" ? 1 : (parseInt(args[3]) || 1);
						let to = args[4] == "-" ? orderedSongs.length : (parseInt(args[4]) || from || orderedSongs.length);
						from = Math.max(from, 1);
						to = Math.min(orderedSongs.length, to);
						if (args[3]) orderedSongs = orderedSongs.slice(from-1, to);
						if (!voiceChannel) return msg.channel.send(`${msg.author.username}, You must join a voice channel first`);
						let progress = 0;
						const getProgressMessage = () => `Please wait, loading songs (${progress}/${orderedSongs.length})`;
						let progressMessage = await msg.channel.send(getProgressMessage());
						let lastEdit = 0;
						Promise.all(orderedSongs.map(song => {
							return new Promise(resolve => {
								ytdl.getInfo(song.videoID).then(info => {
									progress++;
									if (Date.now()-lastEdit > 2000 || progress == orderedSongs.length) {
										lastEdit = Date.now();
										progressMessage.edit(getProgressMessage());
									}
									resolve(info);
								});
							});
						})).then(videos => {
							handleVideo(videos.shift(), msg, voiceChannel).then(() => {
								videos.forEach(video => handleVideo(video, msg, voiceChannel, true, true));
							});
						});
					} else {
						let totalLength = orderedSongs.reduce((p,c) => (p += c.length), 0);
						let author = [];
						if (djs.users.get(playlistRow.author)) {
							author.push(`${djs.users.get(playlistRow.author).username} — ${playlistName}`, `https://cdn.discordapp.com/avatars/${djs.users.get(playlistRow.author).id}/${djs.users.get(playlistRow.author).avatar}.png?size=32`);
						} else {
							author.push(playlistName);
						}
						let embed = new Discord.RichEmbed()
						.setAuthor(author[0], author[1])
						.setDescription(orderedSongs.map((row, index) => `${index+1}. **${row.name}** (${prettySeconds(row.length)})`).join("\n")+"\nTotal length: "+prettySeconds(totalLength));
						msg.channel.send(embed);
					}
				} else return msg.channel.send(`${msg.author.username}, That's not a valid action to do`);
			}
		}
	}
}
