//@ts-check

const Discord = require("discord.js")

const passthrough = require("../../passthrough")
let {client, reloader, commands} = passthrough

let utils = require("../../modules/utilities.js");
reloader.useSync("./modules/utilities.js", utils);

let lang = require("../../modules/lang.js");
reloader.useSync("./modules/lang.js", lang);

let common = require("./common.js")
reloader.useSync("./commands/music/common.js", common)

let songTypes = require("./songtypes.js")
reloader.useSync("./commands/music/songtypes.js", songTypes)

let youtube = passthrough.youtube

commands.assign({
	playlist: {
		aliases: ["playlist", "playlists", "pl"],
		category: "music",
		description: "Create, play, and edit playlists.",
		usage: "",
		process: async function(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.command.guildOnly(msg))
			let args = suffix.split(" ")
			let playlistName = args[0]
			if (playlistName == "show") {
				let playlists = await utils.sql.all(
					"SELECT Playlists.playlistID, Playlists.name, Playlists.author, Playlists.playCount, count(*) as count, sum(Songs.length) as length"
					+" FROM PlaylistSongs"
					+" INNER JOIN Songs USING (videoID) INNER JOIN Playlists USING (playlistID)"
					+" GROUP BY playlistID"
					+" UNION"
					+" SELECT Playlists.playlistID, Playlists.name, Playlists.author, Playlists.playCount, 0, 0"
					+" FROM Playlists"
					+" LEFT JOIN PlaylistSongs USING (playlistID)"
					+" WHERE videoID IS NULL"
				)
				utils.arrayShuffle(playlists)
				playlists = playlists.map(p => {
					p.ranking = "" // higher ascii value is better
					function addRanking(r) {
						p.ranking += r+"."
					}
					if (p.count == 0) addRanking(0)
					else addRanking(1)
					addRanking(p.playCount.toString().padStart(8, "0"))
					return p
				}).sort((a, b) => {
					if (a.ranking < b.ranking) return 1
					else if (b.ranking < a.ranking) return -1
					else return 0
				})
				function getAuthor(author) {
					let user = client.users.get(author)
					if (user) {
						let username = user.username
						if (username.length > 14) username = username.slice(0, 13)+"…"
						return "`"+Discord.Util.escapeMarkdown(username)+"`"
					} else {
						return "(?)"
					}
				}
				return utils.createPagination(
					msg.channel
					,["Playlist", "Songs", "Length", "Plays", "`Author`"]
					,playlists.map(p => [
						p.name
						,p.count.toString()
						,common.prettySeconds(p.length)
						,p.playCount.toString()
						,getAuthor(p.author)
					])
					,["left", "right", "right", "right", ""]
					,2000
				)
			}
			if (!playlistName) return msg.channel.send(msg.author.username+", you must name a playlist. Use `&music playlists show` to show all playlists.");
			let playlistRow = await utils.sql.get("SELECT * FROM Playlists WHERE name = ?", playlistName);
			if (!playlistRow) {
				if (args[1] == "create") {
					await utils.sql.all("INSERT INTO Playlists (author, name) VALUES (?, ?)", [msg.author.id, playlistName]);
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
			let action = args[1] || "";
			if (action.toLowerCase() == "add") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(lang.playlistNotOwned(msg));
				if (!args[2]) return msg.channel.send(`${msg.author.username}, You must provide a YouTube link or some search terms`);
				msg.channel.sendTyping();
				let result = await common.resolveInput.getTracks(args.slice(2).join(" "), msg.channel, msg.author.id);
				(async () => {
					if (result == null) throw new Error()
					let data = result[0]
					if (orderedSongs.some(row => row.videoID == data.info.identifier)) return msg.channel.send(lang.playlistDuplicateItem(msg));
					await Promise.all([
						utils.sql.all("INSERT INTO Songs SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM Songs WHERE videoID = ?)", [data.info.identifier, data.info.title, data.info.length, data.info.identifier]),
						utils.sql.all("INSERT INTO PlaylistSongs VALUES (?, ?, NULL)", [playlistRow.playlistID, data.info.identifier]),
						utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next IS NULL AND videoID != ?", [data.info.identifier, playlistRow.playlistID, data.info.identifier])
					]);
					return msg.channel.send(`${msg.author.username}, Added **${data.info.title}** to playlist **${playlistName}**`);
				})().catch(() => {
					msg.channel.send(`${msg.author.username}, That is not a valid YouTube link`);
				})
			} else if (action.toLowerCase() == "remove") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(lang.playlistNotOwned(msg));
				let index = parseInt(args[2]);
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
				let from = parseInt(args[2]);
				let to = parseInt(args[3]);
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
					.filter(s => s.toLowerCase().includes(args.slice(2).join(" ").toLowerCase()))
					.join("\n");
				if (body.length > 2000) {
					body = body.slice(0, 1998).split("\n").slice(0, -1).join("\n")+"\n…";
				}
				let embed = new Discord.MessageEmbed()
				.setDescription(body)
				.setColor("36393E")
				msg.channel.send(utils.contentify(msg.channel, embed));
			} else if (action.toLowerCase() == "play" || action.toLowerCase() == "p" || action.toLowerCase() == "shuffle") {
				if (!msg.member.voice.channel) return msg.channel.send(lang.voiceMustJoin(msg))
				let rows = utils.playlistSection(orderedSongs, args[2], args[3], action.toLowerCase()[0] == "s");
				if (rows.length) {
					let songs = rows.map(row => new songTypes.YouTubeSong(row.videoID, row.name, row.length))
					common.inserters.fromSongArray(msg.channel, msg.member.voice.channel, songs, false, msg)
				} else {
					msg.channel.send("That playlist is empty. Add some songs with `&music playlist "+playlistRow.name+" add <song>`!")
				}
			} else if (action.toLowerCase() == "import") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(lang.playlistNotOwned(msg));
				if (args[2].match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
					let playlist = await youtube.getPlaylist(args[2]);
					let videos = await playlist.getVideos();
					let promises = [];
					videos = videos.filter((video, i) => {
						if (orderedSongs.some(row => row.videoID == video.id)) return false;
						else if (videos.slice(0, i).some(v => v.id == video.id)) return false;
						else return true;
					});
					let editmsg = await msg.channel.send("Importing playlist. This could take a moment...\n(Fetching song info)");
					let fullvideos = await Promise.all(videos.map(video => common.resolveInput.getTracks(video.id, msg.channel, msg.author.id).then(r => r[0])));
					if (!fullvideos.length) return editmsg.edit(`${msg.author.username}, all videos in that playlist have already been imported.`);
					await editmsg.edit("Importing playlist. This could take a moment...\n(Updating database)");
					for (let i = 0; i < fullvideos.length; i++) {
						let video = fullvideos[i];
						promises.push(utils.sql.all(
							"INSERT INTO Songs SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM Songs WHERE videoID = ?)",
							[video.info.identifier, video.info.title, video.info.length, video.info.identifier]
						));
						if (i != fullvideos.length-1) {
							let nextVideo = fullvideos[i+1];
							promises.push(utils.sql.all(
								"INSERT INTO PlaylistSongs VALUES (?, ?, ?)",
								[playlistRow.playlistID, video.info.identifier, nextVideo.info]
							));
						} else {
							promises.push(utils.sql.all(
								"INSERT INTO PlaylistSongs VALUES (?, ?, NULL)",
								[playlistRow.playlistID, video.info.identifier]
							));
						}
					}
					promises.push(utils.sql.all(
						"UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next IS NULL AND videoID != ?",
						[fullvideos[0].info.identifier, playlistRow.playlistID, fullvideos.slice(-1)[0].info.identifier]
					));
					await Promise.all(promises);
					editmsg.edit(`All done! Check out your playlist with **&music playlist ${playlistName}**.`);
				} else return msg.channel.send(`${msg.author.username}, please provide a YouTube playlist link.`);
			} else if (action.toLowerCase() == "delete") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(lang.playlistNotOwned(msg));
				let deletePromptEmbed = new Discord.MessageEmbed().setColor("dd1d1d").setDescription(
					"This action will permanently delete the playlist `"+playlistRow.name+"`. "+
					"After deletion, you will not be able to play, display, or modify the playlist, and anyone will be able to create a new playlist with the same name.\n"+
					"You will not be able to undo this action.\n\n"+
					"<:bn_del:331164186790854656> - confirm deletion\n"+
					"<:bn_ti:327986149203116032> - ignore"
				);
				let message = await msg.channel.send(utils.contentify(msg.channel, deletePromptEmbed))
				utils.reactionMenu(message, [
					{emoji: client.emojis.get("331164186790854656"), allowedUsers: [msg.author.id], remove: "all", ignore: "total", actionType: "js", actionData: async () => {
						await Promise.all([
							utils.sql.all("DELETE FROM Playlists WHERE playlistID = ?", playlistRow.playlistID),
							utils.sql.all("DELETE FROM PlaylistSongs WHERE playlistID = ?", playlistRow.playlistID)
						]);
						deletePromptEmbed.setDescription("Playlist deleted.");
						message.edit(utils.contentify(msg.channel, deletePromptEmbed));
					}},
					//@ts-ignore: actionData is normally a function, but actionType here is "edit".
					{emoji: client.emojis.get("327986149203116032"), allowedUsers: [msg.author.id], remove: "all", ignore: "total", actionType: "edit", actionData: utils.contentify(msg.channel, new Discord.MessageEmbed().setColor("36393e").setDescription("Playlist deletion cancelled"))}
				]);
			} else {
				let author = [];
				if (client.users.get(playlistRow.author)) {
					author.push(`${client.users.get(playlistRow.author).tag} — ${playlistName}`, client.users.get(playlistRow.author).avatarURL({format: "png", size: 32}));
				} else {
					author.push(playlistName);
				}

				let rows = orderedSongs.map((song, index) => `${index+1}. **${song.name}** (${common.prettySeconds(song.length)})`)
				let totalLength = "\nTotal length: "+common.prettySeconds(orderedSongs.reduce((acc, cur) => (acc + cur.length), 0))
				let embed = new Discord.MessageEmbed()
				.setAuthor(author[0], author[1])
				.setColor("36393E")
				if (rows.length <= 22 && rows.join("\n").length + totalLength.length <= 2000) {
					embed.setDescription(rows.join("\n")+totalLength)
					msg.channel.send(utils.contentify(msg.channel, embed));
				} else {
					let pages = []
					let currentPage = []
					let currentPageLength = 0
					let currentPageMaxLength = 2000 - totalLength.length
					let itemsPerPage = 20
					let itemsPerPageTolerance = 2
					for (let i = 0; i < rows.length; i++) {
						let row = rows[i]
						if ((currentPage.length >= itemsPerPage && rows.length-i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
							pages.push(currentPage)
							currentPage = []
							currentPageLength = 0
						}
						currentPage.push(row)
						currentPageLength += row.length+1
					}
					pages.push(currentPage)
					utils.paginate(msg.channel, pages.length, page => {
						embed.setFooter(`Page ${page+1} of ${pages.length}`)
						embed.setDescription(pages[page].join("\n") + totalLength)
						return utils.contentify(msg.channel, embed)
					})
				}
			}
		}
	}
})
