//@ts-ignore
require("../../types.js")

const Discord = require("discord.js")
const ytdl = require("ytdl-core")

/** @param {PassthroughType} passthrough */
module.exports = passthrough => {
	let {client, reloader} = passthrough

	let utils = require("../../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);
	
	let common = require("./common.js")(passthrough)
	reloader.useSync("./commands/music/common.js", common)


	let songTypes = require("./songtypes.js")(passthrough)
	reloader.useSync("./commands/music/songtypes.js", songTypes)

	return {
		command: async function(msg, args, bulkPlayCallback) {
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
				if (!args[3]) return msg.channel.send(`${msg.author.username}, You must provide a YouTube link or some search terms`);
				msg.channel.sendTyping();
				let result = await common.resolveInput.toIDWithSearch(args.slice(3).join(" "), msg.channel, msg.author.id);
				if (result == null) return;
				ytdl.getInfo(result[0]).then(async video => {
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
					.map((songss, index) => `${index+1}. **${songss.name}** (${common.prettySeconds(songss.length)})`)
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
				if (!msg.member.voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg))
				let rows = utils.playlistSection(orderedSongs, args[3], args[4], action.toLowerCase()[0] == "s");
				rows = rows.map(row => new songTypes.YouTubeSong(row.videoID, undefined, false, {
					title: row.name,
					length_seconds: row.length
				}));
				bulkPlayCallback(rows);
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
				let totalLength = "\nTotal length: "+common.prettySeconds(orderedSongs.reduce((p,c) => (p+parseInt(c.length)), 0));
				let body = orderedSongs.map((songss, index) => `${index+1}. **${songss.name}** (${common.prettySeconds(songss.length)})`).join('\n');
				if (body.length+totalLength.length > 2000) {
					let first = body.slice(0, 995-totalLength.length/2).split("\n").slice(0, -1).join("\n");
					let last = body.slice(totalLength.length/2-995).split("\n").slice(1).join("\n");
					body = first+"\n…\n"+last;
				}
				body += totalLength;
				let embed = new Discord.RichEmbed()
				.setAuthor(author[0], author[1])
				//.setDescription(orderedSongs.map((row, index) => `${index+1}. **${row.name}** (${common.prettySeconds(row.length)})`).join("\n")+"\nTotal length: "+common.prettySeconds(totalLength))
				.setDescription(body)
				.setColor("36393E")
				msg.channel.send(embed);
			}
		}
	}
}