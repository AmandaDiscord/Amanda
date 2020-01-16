// @ts-check

const Discord = require("discord.js")

const passthrough = require("../../passthrough")
const { client, config, reloader, commands } = passthrough

const utils = require("../../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

const common = require("./common.js")
reloader.useSync("./commands/music/common.js", common)

const songTypes = require("./songtypes.js")
reloader.useSync("./commands/music/songtypes.js", songTypes)

const youtube = passthrough.youtube

commands.assign({
	playlist: {
		aliases: ["playlist", "playlists", "pl"],
		category: "audio",
		description: "Create, play, and edit playlists.",
		usage: "",
		process: async function(msg, suffix, lang) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.audio.music.prompts.guildOnly)
			const args = suffix.split(" ")
			const playlistName = args[0]
			if (playlistName == "show") {
				let playlists = await utils.sql.all(
					"SELECT Playlists.playlistID, Playlists.name, Playlists.author, Playlists.playCount, count(*) as count, sum(Songs.length) as length"
					+ " FROM PlaylistSongs"
					+ " INNER JOIN Songs USING (videoID) INNER JOIN Playlists USING (playlistID)"
					+ " GROUP BY playlistID"
					+ " UNION"
					+ " SELECT Playlists.playlistID, Playlists.name, Playlists.author, Playlists.playCount, 0, 0"
					+ " FROM Playlists"
					+ " LEFT JOIN PlaylistSongs USING (playlistID)"
					+ " WHERE videoID IS NULL"
				)
				utils.arrayShuffle(playlists)
				playlists = playlists.map(p => {
					p.ranking = "" // higher ascii value is better
					function addRanking(r) {
						p.ranking += `${r}.`
					}
					if (p.author == msg.author.id) addRanking(1)
					else addRanking(0)
					if (p.count == 0) addRanking(0)
					else addRanking(1)
					addRanking(p.playCount.toString().padStart(8, "0"))
					return p
				}).sort((a, b) => {
					if (a.ranking < b.ranking) return 1
					else if (b.ranking < a.ranking) return -1
					else return 0
				})
				// eslint-disable-next-line no-inner-declarations
				function getAuthor(author) {
					const user = client.users.get(author)
					if (user) {
						let username = user.username
						if (username.length > 14) username = username.slice(0, 13) + "…"
						return `\`${Discord.Util.escapeMarkdown(username)}\``
					} else return "(?)"
				}
				return utils.createPagination(
					msg.channel
					, ["Playlist", "Songs", "Length", "Plays", "`Author`"]
					, playlists.map(p => [
						p.name
						, p.count.toString()
						, common.prettySeconds(p.length)
						, p.playCount.toString()
						, getAuthor(p.author)
					])
					, ["left", "right", "right", "right", ""]
					, 2000
				)
			}
			if (!playlistName) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNameRequired, { "username": msg.author.username }))
			if (playlistName.includes("http") || playlistName.includes("youtube.com") || playlistName.includes("www.") || playlistName.match(/PL[A-Za-z0-9_-]{16,}/)) {
				return msg.channel.send(utils.replace(lang.audio.playlist.prompts.directPlaylist, { "info": "`&music play https://youtube.com/playlist?list=PLAAAABBBBCC`" }))
			}
			if (playlistName.length > 24) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNameLimit, { "username": msg.author.username }))
			const playlistRow = await utils.sql.get("SELECT * FROM Playlists WHERE name = ?", playlistName)
			if (!playlistRow) {
				if (args[1] == "create") {
					await utils.sql.all("INSERT INTO Playlists (author, name) VALUES (?, ?)", [msg.author.id, playlistName])
					return msg.channel.send(utils.replace(lang.audio.playlist.returns.playlistCreated, { "username": msg.author.username, "playlist": playlistName }))
				} else return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotExist, { "username": msg.author.username, "playlist": playlistName }))
			}
			const songs = await utils.sql.all("SELECT * FROM PlaylistSongs INNER JOIN Songs ON Songs.videoID = PlaylistSongs.videoID WHERE playlistID = ?", playlistRow.playlistID)
			const orderedSongs = []
			let song = songs.find(row => !songs.some(r => r.next == row.videoID))
			while (song) {
				orderedSongs.push(song)
				if (song.next) song = songs.find(row => row.videoID == song.next)
				else song = null
				if (orderedSongs.includes(song)) {
					await unbreakDatabase()
					return
				}
			}
			if (orderedSongs.length != songs.length) {
				await unbreakDatabase()
				return
			}
			async function unbreakDatabase() {
				console.log("unbreakDatabase was called!")
				//await utils.sql.all("BEGIN TRANSACTION") apparently transactions are only optimal for HUGE volumes of data, see: https://stackoverflow.com/questions/14675147/why-does-transaction-commit-improve-performance-so-much-with-php-mysql-innodb#comment57894347_35084678
				await Promise.all(songs.map((row, index) => {
					return utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [(songs[index + 1] ? songs[index + 1].videoID : null), row.playlistID, row.videoID])
				}))
				//await utils.sql.all("END TRANSACTION")
				return msg.channel.send(utils.replace(lang.audio.playlist.prompts.databaseFixed, { "username": msg.author.username }))
			}
			const action = args[1] || ""
			if (action.toLowerCase() == "add") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				if (!args[2]) return msg.channel.send(utils.replace(lang.audio.music.prompts.playableRequired, { "username": msg.author.username }))
				msg.channel.sendTyping()

				const search = args.slice(2).join(" ")
				const match = common.inputToID(search)
				if (match && match.type === "playlist") return msg.channel.send(lang.audio.playlist.prompts.usePlaylistAdd)

				// Resolve the content
				/** @type {{id: string, title: string, lengthSeconds: number}|null} */
				let result = await (async () => {
					if (!match || !match.id || match.type !== "video") throw "Not an ID, search instead"
					if (config.use_invidious) { // Resolve tracks with Invidious
						return common.invidious.getData(match.id).then(async data => {
							return { id: data.videoID, title: data.title, lengthSeconds: data.lengthSeconds }
						})
					} else { // Resolve tracks with Lavalink
						return common.getTracks(match.id).then(tracks => {
							if (tracks && tracks[0]) {
								// If the ID worked, add the song
								return { id: tracks[0].info.identifier, title: tracks[0].info.title, lengthSeconds: tracks[0].info.length }
							} else throw "Lavalink returned no tracks"
						})
					}
				})().catch(() => {
					// Treating as ID failed, so start a search
					return common.getTracks(`ytsearch:${search}`).then(tracks => {
						if (tracks && tracks[0]) {
							return { id: tracks[0].info.identifier, title: tracks[0].info.title, lengthSeconds: Math.floor(tracks[0].info.length/1000) }
						} else return null // no results
					})
				}) // errors that reach here are actual errors, not failed requests

				if (!result) return msg.channel.send("No results.")

				if (orderedSongs.some(row => row.videoID == result.id)) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistDuplicateSong, { "username": msg.author.username }))

				Promise.all([
					utils.sql.all("INSERT INTO Songs SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM Songs WHERE videoID = ?)", [result.id, result.title, result.lengthSeconds, result.id]),
					utils.sql.all("INSERT INTO PlaylistSongs VALUES (?, ?, NULL)", [playlistRow.playlistID, result.id]),
					utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next IS NULL AND videoID != ?", [result.id, playlistRow.playlistID, result.id])
				]).then(() => {
					msg.channel.send(utils.replace(lang.audio.playlist.returns.playlistAdded, { "username": msg.author.username, "song": result.title, "playlist": playlistName }))
				}).catch(() => {
					msg.channel.send(utils.replace(lang.audio.playlist.prompts.youtubeLinkInvalid, { "username": msg.author.username }))
				})
			} else if (action.toLowerCase() == "remove") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				let index = Number(args[2])
				if (!index) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.indexRequired, { "username": msg.author.username }))
				index = index - 1
				if (!orderedSongs[index]) return msg.channel.send("Out of range")
				const toRemove = orderedSongs[index]
				await Promise.all([
					utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [toRemove.next, toRemove.playlistID, toRemove.videoID]),
					utils.sql.all("DELETE FROM PlaylistSongs WHERE playlistID = ? AND videoID = ?", [playlistRow.playlistID, toRemove.videoID])
				])
				return msg.channel.send(utils.replace(lang.audio.playlist.returns.playlistRemoved, { "username": msg.author.username, "song": toRemove.name, "playlist": playlistName }))
			} else if (action.toLowerCase() == "move") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				let from = Number(args[2])
				let to = Number(args[3])
				if (!from || !to) return msg.channel.send(lang.audio.playlist.prompts.indexMoveRequired)
				from--; to--
				if (!orderedSongs[from]) return msg.channel.send("Out of range")
				if (!orderedSongs[to]) return msg.channel.send("Out of range")
				const fromRow = orderedSongs[from], toRow = orderedSongs[to]
				if (from < to) {
					await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [fromRow.next, fromRow.playlistID, fromRow.videoID]) // update row before item
					await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [toRow.next, fromRow.playlistID, fromRow.videoID]) // update moved item
					await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [fromRow.videoID, fromRow.playlistID, toRow.videoID]) // update row before moved item
				} else if (from > to) {
					await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [fromRow.next, fromRow.playlistID, fromRow.videoID]) // update row before item
					await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next = ?", [fromRow.videoID, fromRow.playlistID, toRow.videoID]) // update row before moved item
					await utils.sql.all("UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND videoID = ?", [toRow.videoID, fromRow.playlistID, fromRow.videoID]) // update moved item
				} else return msg.channel.send(`${msg.author.username}, Those two indexes are equal.`)
				return msg.channel.send(utils.replace(lang.audio.playlist.returns.playlistMoved, { "username": msg.author.username, "song": fromRow.name, "index": to + 1 }))
			} else if (action.toLowerCase() == "search" || action.toLowerCase() == "find") {
				let body = orderedSongs
					.map((songss, index) => `${index + 1}. **${songss.name}** (${common.prettySeconds(songss.length)})`)
					.filter(s => s.toLowerCase().includes(args.slice(2).join(" ").toLowerCase()))
					.join("\n")
				if (body.length > 2000) body = `${body.slice(0, 1998).split("\n").slice(0, -1).join("\n")}\n…`
				const embed = new Discord.MessageEmbed()
					.setDescription(body)
					.setColor(0x36393f)
				msg.channel.send(utils.contentify(msg.channel, embed))
			} else if (action.toLowerCase() == "play" || action.toLowerCase() == "p" || action.toLowerCase() == "shuffle") {
				const voiceChannel = await common.detectVoiceChannel(msg, true, lang)
				if (!voiceChannel) return
				const rows = utils.playlistSection(orderedSongs, args[2], args[3], action.toLowerCase()[0] == "s")
				if (rows.length) {
					const songss = rows.map(row => new songTypes.YouTubeSong(row.videoID, row.name, row.length))
					common.inserters.fromSongArray(msg.channel, voiceChannel, songss, false, msg)
				} else msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistEmpty, { "playlist": playlistName }))
			} else if (action.toLowerCase() == "import") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				if (args[2].match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
					const playlist = await youtube.getPlaylist(args[2])
					let videos = await playlist.getVideos()
					const promises = []
					videos = videos.filter((video, i) => {
						if (orderedSongs.some(row => row.videoID == video.id)) return false
						else if (videos.slice(0, i).some(v => v.id == video.id)) return false
						else return true
					})
					const editmsg = await msg.channel.send(lang.audio.playlist.prompts.playlistImporting)
					const fullvideos = await Promise.all(videos.map(video => common.getTracks(video.id).then(r => r[0])))
					if (!fullvideos.length) return editmsg.edit(utils.replace(lang.audio.playlist.prompts.playlistImportAllExisting, { "username": msg.author.username }))
					await editmsg.edit(lang.audio.playlist.prompts.playlistImportingDatabase)
					for (let i = 0; i < fullvideos.length; i++) {
						const video = fullvideos[i]
						promises.push(utils.sql.all(
							"INSERT INTO Songs SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM Songs WHERE videoID = ?)",
							[video.info.identifier, video.info.title, video.info.length, video.info.identifier]
						))
						if (i != fullvideos.length - 1) {
							const nextVideo = fullvideos[i + 1]
							promises.push(utils.sql.all(
								"INSERT INTO PlaylistSongs VALUES (?, ?, ?)",
								[playlistRow.playlistID, video.info.identifier, nextVideo.info]
							))
						} else {
							promises.push(utils.sql.all(
								"INSERT INTO PlaylistSongs VALUES (?, ?, NULL)",
								[playlistRow.playlistID, video.info.identifier]
							))
						}
					}
					promises.push(utils.sql.all(
						"UPDATE PlaylistSongs SET next = ? WHERE playlistID = ? AND next IS NULL AND videoID != ?",
						[fullvideos[0].info.identifier, playlistRow.playlistID, fullvideos.slice(-1)[0].info.identifier]
					))
					await Promise.all(promises)
					editmsg.edit(utils.replace(lang.audio.playlist.returns.playlistImportDone, { "username": msg.author.username, "playlist": playlistName }))
				} else return msg.channel.send(utils.replace(lang.audio.music.prompts.youtubeRequired, { "username": msg.author.username }))
			} else if (action.toLowerCase() == "delete") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				const deletePromptEmbed = new Discord.MessageEmbed().setColor("dd1d1d").setDescription(utils.replace(lang.audio.playlist.prompts.playlistDeleteConfirm, { "playlist": playlistRow.name }))
				const message = await msg.channel.send(utils.contentify(msg.channel, deletePromptEmbed))
				utils.reactionMenu(message, [
					{ emoji: client.emojis.get("331164186790854656"), allowedUsers: [msg.author.id], remove: "all", ignore: "total", actionType: "js", actionData: async () => {
						await Promise.all([
							utils.sql.all("DELETE FROM Playlists WHERE playlistID = ?", playlistRow.playlistID),
							utils.sql.all("DELETE FROM PlaylistSongs WHERE playlistID = ?", playlistRow.playlistID)
						])
						deletePromptEmbed.setDescription(lang.audio.playlist.returns.playlistDeleted)
						message.edit(utils.contentify(msg.channel, deletePromptEmbed))
					} },
					// @ts-ignore: actionData is normally a function, but actionType here is "edit".
					{ emoji: client.emojis.get("327986149203116032"), allowedUsers: [msg.author.id], remove: "all", ignore: "total", actionType: "edit", actionData: utils.contentify(msg.channel, new Discord.MessageEmbed().setColor("36393e").setDescription("Playlist deletion cancelled")) }
				])
			} else {
				const author = []
				if (client.users.get(playlistRow.author)) author.push(`${client.users.get(playlistRow.author).tag} — ${playlistName}`, client.users.get(playlistRow.author).displayAvatarURL({ format: "png", size: 32 }))
				else author.push(playlistName)
				const rows = orderedSongs.map((s, index) => `${index + 1}. **${s.name}** (${common.prettySeconds(s.length)})`)
				const totalLength = `\nTotal length: ${common.prettySeconds(orderedSongs.reduce((acc, cur) => (acc + cur.length), 0))}`
				const embed = new Discord.MessageEmbed()
					.setAuthor(author[0], author[1])
					.setColor("36393E")
				if (rows.length <= 22 && rows.join("\n").length + totalLength.length <= 2000) {
					embed.setDescription(rows.join("\n") + totalLength)
					msg.channel.send(utils.contentify(msg.channel, embed))
				} else {
					const pages = []
					let currentPage = []
					let currentPageLength = 0
					const currentPageMaxLength = 2000 - totalLength.length
					const itemsPerPage = 20
					const itemsPerPageTolerance = 2
					for (let i = 0; i < rows.length; i++) {
						const row = rows[i]
						if ((currentPage.length >= itemsPerPage && rows.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
							pages.push(currentPage)
							currentPage = []
							currentPageLength = 0
						}
						currentPage.push(row)
						currentPageLength += row.length + 1
					}
					pages.push(currentPage)
					utils.paginate(msg.channel, pages.length, page => {
						embed.setFooter(`Page ${page + 1} of ${pages.length}`)
						embed.setDescription(pages[page].join("\n") + totalLength)
						return utils.contentify(msg.channel, embed)
					})
				}
			}
		}
	}
})
