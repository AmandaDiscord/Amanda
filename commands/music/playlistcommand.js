// @ts-check

const Discord = require("thunderstorm")
const path = require("path")
const ReactionMenu = require("@amanda/reactionmenu")

const passthrough = require("../../passthrough")
const { client, config, reloader, commands, constants } = passthrough

const utils = require("../../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

const common = require("./common.js")
reloader.sync("./commands/music/common.js", common)

const songTypes = require("./songtypes.js")
reloader.sync("./commands/music/songtypes.js", songTypes)

const YouTube = require("simple-youtube-api")

const bulkAddCollectionChannels = new Set()

commands.assign([
	{
		usage: "none",
		aliases: ["playlist", "playlists", "pl"],
		category: "audio",
		description: "Create, play, and edit playlists.",
		async process(msg, suffix, lang) {
			if (await utils.cacheManager.channels.typeOf(msg.channel) === "dm") return msg.channel.send(lang.audio.music.prompts.guildOnly)
			const args = suffix.split(" ")
			const playlistName = args[0]
			if (playlistName == "show") {
				let playlists = await utils.sql.all(
					"SELECT playlists.playlist_id, playlists.name, playlists.author, playlists.play_count, count(*) as count, sum(songs.length) as length \
					FROM playlist_songs \
					INNER JOIN songs USING (video_id) INNER JOIN playlists USING (playlist_id) \
					GROUP BY playlist_id \
					UNION \
					SELECT playlists.playlist_id, playlists.name, playlists.author, playlists.play_count, 0, 0 \
					FROM playlists \
					LEFT JOIN playlist_songs USING (playlist_id) \
					WHERE video_id IS NULL"
				)
				utils.arrayShuffle(playlists)
				playlists = playlists.map(p => {
					p.ranking = "" // higher ascii value is better
					/**
					 * @param {number} r
					 */
					function addRanking(r) {
						p.ranking += `${r}.`
					}
					if (p.author == msg.author.id) addRanking(1)
					else addRanking(0)
					if (p.count == 0) addRanking(0)
					else addRanking(1)
					addRanking(p.play_count.toString().padStart(8, "0"))
					return p
				}).sort((a, b) => {
					if (a.ranking < b.ranking) return 1
					else if (b.ranking < a.ranking) return -1
					else return 0
				})
				/**
				 * @param {string} author
				 */
				// eslint-disable-next-line no-inner-declarations
				async function getAuthor(author) {
					/** @type {Discord.User} */
					// @ts-ignore
					const user = await utils.cacheManager.users.get(author, true, true)
					if (user) {
						let username = user.username
						if (username.length > 14) username = `${username.slice(0, 13)}…`
						return `\`${Discord.Util.escapeMarkdown(username)}\``
					} else return "(?)"
				}
				const users = await Promise.all(playlists.map(p => getAuthor(p.author)))
				return utils.createPagination(
					msg.channel
					, ["Playlist", "Songs", "Length", "Plays", "`Author`"]
					, playlists.map((p, index) => [
						p.name
						, p.count.toString()
						, common.prettySeconds(p.length)
						, p.play_count.toString()
						, users[index]
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
			const playlistRow = await utils.sql.get("SELECT * FROM playlists WHERE name = $1", playlistName)
			if (!playlistRow) {
				if (args[1] == "create") {
					await utils.sql.all("INSERT INTO playlists (author, name) VALUES ($1, $2)", [msg.author.id, playlistName])
					return msg.channel.send(utils.replace(lang.audio.playlist.returns.playlistCreated, { "username": msg.author.username, "playlist": playlistName }))
				} else return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotExist, { "username": msg.author.username, "playlist": playlistName }))
			}
			const songs = await utils.sql.all("SELECT * FROM playlist_songs INNER JOIN songs ON songs.video_id = playlist_songs.video_id WHERE playlist_id = $1", playlistRow.playlist_id)
			const orderedSongs = []
			let song = songs.find(row => !songs.some(r => r.next == row.video_id))
			while (song) {
				orderedSongs.push(song)
				if (song.next) song = songs.find(row => row.video_id == song.next)
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
				// await utils.sql.all("BEGIN TRANSACTION") apparently transactions are only optimal for HUGE volumes of data, see: https://stackoverflow.com/questions/14675147/why-does-transaction-commit-improve-performance-so-much-with-php-mysql-innodb#comment57894347_35084678
				await Promise.all(songs.map((row, index) => {
					return utils.sql.all("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND video_id = $3", [(songs[index + 1] ? songs[index + 1].video_id : null), row.playlist_id, row.video_id])
				}))
				// await utils.sql.all("END TRANSACTION")
				return msg.channel.send(utils.replace(lang.audio.playlist.prompts.databaseFixed, { "username": msg.author.username }))
			}
			const action = args[1] || ""
			if (action.toLowerCase() === "bulk" || action.toLowerCase() === "bulkadd") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				if (bulkAddCollectionChannels.has(msg.channel.id)) return msg.channel.send(lang.audio.playlist.prompts.bulkMenuOpen)
				bulkAddCollectionChannels.add(msg.channel.id)
				const confirmation = await msg.channel.send(await utils.contentify(msg.channel,
					new Discord.MessageEmbed()
						.setTitle(lang.audio.playlist.prompts.bulkListening)
						.setDescription(utils.replace(lang.audio.playlist.prompts.bulkDescription, { "prefix": passthrough.statusPrefix })
						)
						.setColor(0x22dddd)
				))
				utils.createMessageCollector({ channelID: msg.channel.id, userIDs: [msg.author.id] }, (msgg) => {
					if (msgg.content.startsWith(passthrough.statusPrefix)) {
						return // ignore commands
					} else if (msgg.content === "undo") {
						commands.cache.get("playlist").process(msgg, `${playlistName} remove last`, lang)
					} else {
						commands.cache.get("playlist").process(msgg, `${playlistName} add ${msgg.content}`, lang)
					}
					msg.channel.send(lang.audio.playlist.returns.bulkDone)
					confirmation.edit(lang.audio.playlist.returns.bulkMenuGone, { embed: null })
					bulkAddCollectionChannels.delete(msg.channel.id)
				})
			} else if (action.toLowerCase() == "add") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				if (!args[2]) return msg.channel.send(utils.replace(lang.audio.music.prompts.playableRequired, { "username": msg.author.username }))
				await msg.channel.sendTyping()

				const search = args.slice(2).join(" ")
				const match = common.inputToID(search)
				if (match && match.type === "playlist") return msg.channel.send(lang.audio.playlist.prompts.usePlaylistAdd)

				// Out-of-band symbols that can be thrown and matched to detect specific errors
				const NOT_AN_ID = Symbol("NOT_AN_ID")
				const NO_TRACKS = Symbol("NO_TRACKS")

				/**
				 * @type {Discord.Guild}
				 */
				// @ts-ignore
				const guild = await utils.cacheManager.guilds.get(msg.guild.id, true, true)

				// Resolve the content
				/** @type {{id: string, title: string, lengthSeconds: number}|null} */
				// Just trust me on this eslint control:
				// eslint-disable-next-line require-await
				const result = await (async () => {
					if (!match || !match.id || match.type !== "video") throw NOT_AN_ID
					if (config.use_invidious) { // Resolve tracks with Invidious
						return common.invidious.getData(match.id).then(data => {
							return { id: data.videoId, title: data.title, lengthSeconds: data.lengthSeconds }
						})
					} else { // Resolve tracks with Lavalink
						return common.getTracks(match.id, guild.region).then(tracks => {
							if (tracks && tracks[0]) {
								// If the ID worked, add the song
								return { id: tracks[0].info.identifier, title: tracks[0].info.title, lengthSeconds: Math.floor(tracks[0].info.length / 1000) }
							} else throw NO_TRACKS
						})
					}
				})().catch(() => {
					// Treating as ID failed, so start a search
					return common.getTracks(`ytsearch:${search}`, guild.region).then(tracks => {
						if (tracks && tracks[0]) {
							return { id: tracks[0].info.identifier, title: tracks[0].info.title, lengthSeconds: Math.floor(tracks[0].info.length / 1000) }
						} else return null // no results
					})
				}) // errors that reach here are actual errors, not failed requests

				if (!result) return msg.channel.send(lang.audio.music.prompts.noResults)

				if (orderedSongs.some(row => row.video_id == result.id)) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistDuplicateSong, { "username": msg.author.username }))

				Promise.all([
					utils.sql.all("INSERT INTO songs SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM songs WHERE video_id = $4)", [result.id, result.title, result.lengthSeconds, result.id]),
					utils.sql.all("INSERT INTO playlist_songs VALUES ($1, $2, NULL)", [playlistRow.playlist_id, result.id]),
					utils.sql.all("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND next IS NULL AND video_id != $3", [result.id, playlistRow.playlist_id, result.id])
				]).then(() => {
					msg.channel.send(utils.replace(lang.audio.playlist.returns.playlistAdded, { "username": msg.author.username, "song": result.title, "playlist": playlistName }))
				}).catch(() => {
					msg.channel.send(utils.replace(lang.audio.playlist.prompts.youtubeLinkInvalid, { "username": msg.author.username }))
				})
			} else if (action.toLowerCase() == "remove") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				let index = args[2] === "last" ? orderedSongs.length : utils.parseNumber(args[2])
				if (!index) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.indexRequired, { "username": msg.author.username }))
				index = index - 1
				if (!orderedSongs[index]) return msg.channel.send(lang.audio.playlist.prompts.outOfRange)
				const toRemove = orderedSongs[index]
				await Promise.all([
					utils.sql.all("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND next = $3", [toRemove.next, toRemove.playlist_id, toRemove.video_id]),
					utils.sql.all("DELETE FROM playlist_songs WHERE playlist_id = $1 AND video_id = $2", [playlistRow.playlist_id, toRemove.video_id])
				])
				return msg.channel.send(utils.replace(lang.audio.playlist.returns.playlistRemoved, { "username": msg.author.username, "song": toRemove.name, "playlist": playlistName }))
			} else if (action.toLowerCase() == "move") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				let from = utils.parseNumber(args[2])
				let to = utils.parseNumber(args[3])
				if (!from || !to) return msg.channel.send(lang.audio.playlist.prompts.indexMoveRequired)
				from--; to--
				if (!orderedSongs[from]) return msg.channel.send(lang.audio.playlist.prompts.outOfRange)
				if (!orderedSongs[to]) return msg.channel.send(lang.audio.playlist.prompts.outOfRange)
				const fromRow = orderedSongs[from], toRow = orderedSongs[to]
				if (from < to) {
					await utils.sql.all("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND next = $3", [fromRow.next, fromRow.playlist_id, fromRow.video_id]) // update row before item
					await utils.sql.all("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND video_id = $3", [toRow.next, fromRow.playlist_id, fromRow.video_id]) // update moved item
					await utils.sql.all("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND video_id = $3", [fromRow.video_id, fromRow.playlist_id, toRow.video_id]) // update row before moved item
				} else if (from > to) {
					await utils.sql.all("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND next = $3", [fromRow.next, fromRow.playlist_id, fromRow.video_id]) // update row before item
					await utils.sql.all("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND next = $3", [fromRow.video_id, fromRow.playlist_id, toRow.video_id]) // update row before moved item
					await utils.sql.all("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND video_id = $3", [toRow.video_id, fromRow.playlist_id, fromRow.video_id]) // update moved item
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
					.setColor(constants.standard_embed_color)
				msg.channel.send(await utils.contentify(msg.channel, embed))
			} else if (action.toLowerCase() == "play" || action.toLowerCase() == "p" || action.toLowerCase() == "shuffle") {
				const voiceChannel = await common.detectVoiceChannel(msg, true, lang)
				if (!voiceChannel) return
				const rows = utils.playlistSection(orderedSongs, args[2], args[3], action.toLowerCase()[0] == "s")
				if (rows.length) {
					const songss = rows.map(row => new songTypes.YouTubeSong(row.video_id, row.name, row.length))
					common.inserters.fromSongArray(msg.channel, voiceChannel, songss, false, msg)
				} else msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistEmpty, { "playlist": playlistName }))
			} else if (action.toLowerCase() == "import") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				if (args[2].match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
					const playlistURL = args[2]
					const playlistID = YouTube.Playlist.extractID(playlistURL)
					const editmsg = await msg.channel.send(lang.audio.playlist.prompts.playlistImporting)
					let videos = await common.invidious.getPlaylist(playlistID)
					// console.log(videos.map(v => typeof v === "object" ? v.videoId : v).join("\n"))
					const promises = []
					videos = videos.filter((video, i) => {
						if (orderedSongs.some(row => row.video_id == video.videoId)) return false
						else if (videos.slice(0, i).some(v => v.videoId == video.videoId)) return false
						else return true
					})
					if (!videos.length) return editmsg.edit(utils.replace(lang.audio.playlist.prompts.playlistImportAllExisting, { "username": msg.author.username }))
					await editmsg.edit(lang.audio.playlist.prompts.playlistImportingDatabase)
					for (let i = 0; i < videos.length; i++) {
						const video = videos[i]
						promises.push(utils.sql.all(
							"INSERT INTO songs SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM songs WHERE video_id = $1)",
							[video.videoId, video.title, video.lengthSeconds]
						))
						if (i != videos.length - 1) {
							const nextVideo = videos[i + 1]
							promises.push(utils.sql.all(
								"INSERT INTO playlist_songs (playlist_id, video_id, next) VALUES ($1, $2, $3)",
								[playlistRow.playlist_id, video.videoId, nextVideo.videoId]
							))
						} else {
							promises.push(utils.sql.all(
								"INSERT INTO playlist_songs (playlist_id, video_id, next) VALUES ($1, $2, NULL)",
								[playlistRow.playlist_id, video.videoId]
							))
						}
					}
					promises.push(utils.sql.all(
						"UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND next IS NULL AND video_id != $3",
						[videos[0].videoId, playlistRow.playlist_id, videos.slice(-1)[0].videoId]
					))
					await Promise.all(promises)
					editmsg.edit(utils.replace(lang.audio.playlist.returns.playlistImportDone, { "username": msg.author.username, "playlist": playlistName }))
				} else return msg.channel.send(utils.replace(lang.audio.music.prompts.youtubeRequired, { "username": msg.author.username }))
			} else if (action.toLowerCase() == "delete") {
				if (playlistRow.author != msg.author.id) return msg.channel.send(utils.replace(lang.audio.playlist.prompts.playlistNotOwned, { "username": msg.author.username }))
				const deletePromptEmbed = new Discord.MessageEmbed().setColor(0xdd1d1d).setDescription(utils.replace(lang.audio.playlist.prompts.playlistDeleteConfirm, { "playlist": playlistRow.name }))
				const message = await msg.channel.send(await utils.contentify(msg.channel, deletePromptEmbed))
				new ReactionMenu(message, client, [
					{ emoji: "bn_del:331164186790854656", allowedUsers: [msg.author.id], remove: "all", ignore: "total", actionType: "js", actionData: async () => {
						await Promise.all([
							utils.sql.all("DELETE FROM playlists WHERE playlist_id = $1", playlistRow.playlist_id),
							utils.sql.all("DELETE FROM playlist_songs WHERE playlist_id = $1", playlistRow.playlist_id)
						])
						deletePromptEmbed.setDescription(lang.audio.playlist.returns.playlistDeleted)
						message.edit(await utils.contentify(msg.channel, deletePromptEmbed))
					} }
				])
			} else {
				const author = []
				/** @type {Discord.User} */
				// @ts-ignore
				const user = await utils.cacheManager.users.get(playlistRow.author, true, true)
				if (user) author.push(`${user.tag} — ${playlistName}`, user.displayAvatarURL({ format: "png", size: 32, dynamic: false }))
				else author.push(playlistName)
				const rows = orderedSongs.map((s, index) => `${index + 1}. **${Discord.Util.escapeMarkdown(s.name)}** (${common.prettySeconds(s.length)})`)
				const totalLength = `\n${utils.replace(lang.audio.music.prompts.totalLength, { "number": common.prettySeconds(orderedSongs.reduce((acc, cur) => (acc + cur.length), 0)) })}`
				const embed = new Discord.MessageEmbed()
					.setAuthor(author[0], author[1])
					.setColor(constants.standard_embed_color)
				if (rows.length <= 22 && rows.join("\n").length + totalLength.length <= 2000) {
					embed.setDescription(rows.join("\n") + totalLength)
					msg.channel.send(await utils.contentify(msg.channel, embed))
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
						embed.setFooter(utils.replace(lang.audio.playlist.prompts.playlistPages, { "number": page + 1, "total": pages.length }))
						embed.setDescription(pages[page].join("\n") + totalLength)
						return utils.contentify(msg.channel, embed)
					})
				}
			}
		}
	}
])
