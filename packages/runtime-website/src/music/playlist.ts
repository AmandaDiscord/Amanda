import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")

import passthrough = require("../passthrough")
const { snow, commands, sync, queues, sql, confprovider } = passthrough

const common: typeof import("./utils") = sync.require("./utils")
const trackTypes: typeof import("./tracktypes") = sync.require("./tracktypes")

import type { ChatInputCommand } from "@amanda/commands"
import type { Lang } from "@amanda/lang"
import type { QueryResultRow } from "pg"
import type { APIEmbedAuthor } from "discord-api-types/v10"
import type { TrackInfo } from "lavalink-types/v4"

const plRegex = /PL[A-Za-z0-9_-]{16,}/
const checkPlaylistName = (playlistName: string, cmd: ChatInputCommand, lang: Lang) => {
	let value = true
	if (playlistName.includes("http") || playlistName.includes("www.") || plRegex.exec(playlistName)) value = false
	if (playlistName.length > 24) value = false
	if (!value) snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.INVALID_PLAYLIST_NAME })
	return value
}

const unbreakDatabase = async (tracks: Array<QueryResultRow>) => {
	console.warn("unbreakDatabase was called!")

	await Promise.all(tracks.map((row, index) => sql.orm.update("playlist_songs", {
		next: (tracks[index + 1] ? tracks[index + 1].video_id : null)
	}, {
		playlist_id: row.playlist_id,
		video_id: row.video_id
	})))
}

const getTracks = async (playlistRow: { playlist_id: number }, cmd: ChatInputCommand, lang: Lang) => {
	const tracks = await sql.all<{ next: string, video_id: string, name: string, length: number, playlist_id: number }>(
		"SELECT * FROM playlist_songs INNER JOIN songs ON songs.video_id = playlist_songs.video_id WHERE playlist_id = $1",
		[playlistRow.playlist_id]
	)

	if (tracks.length === 0) {
		snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			content: lang.GLOBAL.PLAYLIST_EMPTY
		})

		return []
	}

	const orderedTracks: typeof tracks = []
	let track = tracks.find(row => !tracks.some(r => r.next == row.video_id))

	while (track) {
		orderedTracks.push(track!)
		if (track.next) track = tracks.find(row => row.video_id == track!.next)
		else track = void 0
		if (orderedTracks.includes(track!)) await unbreakDatabase(tracks)
	}

	if (orderedTracks.length != tracks.length) await unbreakDatabase(tracks)

	return orderedTracks
}

function addRanking(r: number | string, p: { ranking: string }) {
	p.ranking += `${r}.`
}

async function getAuthor(u: string, lang: Lang) {
	const user = await sharedUtils.getUser(u, snow)
	if (user) {
		let username = user.username || lang.GLOBAL.HEADER_UNKNOWN
		if (username.length > 14) username = `${username.slice(0, 13)}…`
		return `\`${username}\``
	} else return "(?)"
}

commands.assign([
	{
		name: "playlists",
		description: "Manage and play Amanda playlists",
		category: "audio",
		options: [
			{
				name: "meta",
				description: "Metadata commands",
				type: 1,
				required: false,
				options: [
					{
						name: "show",
						description: "Shows all Amanda playlists. True to only show yourself",
						type: 5,
						required: false
					},
					{
						name: "info",
						description: "Shows info for a playlist",
						type: 3,
						required: false
					},
					{
						name: "create",
						description: "Creates a playlist",
						type: 3,
						required: false
					},
					{
						name: "delete",
						description: "Deletes a playlist",
						type: 3,
						required: false
					}
				]
			},
			{
				name: "add",
				description: "Adds a track to a playlist",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "track",
						description: "A resolveable track (link, name, id)",
						type: 3,
						required: true
					}
				]
			},
			{
				name: "remove",
				description: "Removes a track from a playlist",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "index",
						description: "The 1 based index of the track to remove",
						type: 4,
						required: true
					}
				]
			},
			{
				name: "move",
				description: "Moves a track in a playlist from one index to another",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "from",
						description: "The 1 based index of the track to move",
						type: 4,
						required: true
					},
					{
						name: "to",
						description: "The 1 based index the track should appear at",
						type: 4,
						required: true
					}
				]
			},
			{
				name: "search",
				description: "Filters tracks in a playlist",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "query",
						description: "The search term to filter by",
						type: 3,
						required: true
					}
				]
			},
			{
				name: "play",
				description: "Plays a playlist",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "shuffle",
						description: "If the playlist should start shuffled",
						type: 5,
						required: false
					},
					{
						name: "start",
						description: "The 1 based index to start from. When shuffling, only a portion is selected and then shuffled",
						type: 4,
						required: false,
						min_value: 1
					}
				]
			}
		],
		async process(cmd, lang) {
			if (!common.queues.doChecks(cmd, lang)) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.MUSIC_DISABLED
				})
			}

			const optionMeta = cmd.data.options.get("meta") ?? null
			const optionAdd = cmd.data.options.get("add") ?? null
			const optionRemove = cmd.data.options.get("remove") ?? null
			const optionMove = cmd.data.options.get("move") ?? null
			const optionSearch = cmd.data.options.get("search") ?? null
			const optionPlay = cmd.data.options.get("play") ?? null

			const array = [
				optionMeta,
				optionAdd,
				optionRemove,
				optionMove,
				optionSearch,
				optionPlay
			]

			const notNull = array.filter(i => i !== null)

			if (notNull.length === 0) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.MUSIC_INVALID_ACTION, { username: cmd.author.username })
				})
			}

			if (notNull.length > 1) {
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.ONE_ACTION
				})
			}

			if (optionMeta !== null) {


				const optionShow = optionMeta.options.get("show")?.asBoolean() ?? null
				const optionInfo = optionMeta.options.get("info")?.asString() ?? null
				const optionCreate = optionMeta.options.get("create")?.asString() ?? null
				const optionDelete = optionMeta.options.get("delete")?.asString() ?? null

				const array2 = [
					optionShow,
					optionInfo,
					optionCreate,
					optionDelete
				]

				const notNull2 = array2.filter(i => i !== null)
				if (notNull2.length === 0) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: langReplace(lang.GLOBAL.MUSIC_INVALID_ACTION, { username: cmd.author.username })
					})
				}

				if (notNull2.length > 1) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.ONE_ACTION
					})
				}

				if (optionShow !== null) {
					let playlists = await sql.all<{
						playlist_id: string;
						name: string;
						author: string;
						play_count: number;
						count: number;
						length: number;
						ranking: string;
					}>(
						"SELECT playlists.playlist_id, playlists.name, playlists.author, playlists.play_count, count(*) as count, sum(songs.length) as length \
						FROM playlist_songs \
						INNER JOIN songs USING (video_id) INNER JOIN playlists USING (playlist_id) \
						GROUP BY playlists.playlist_id \
						UNION \
						SELECT playlists.playlist_id, playlists.name, playlists.author, playlists.play_count, 0, 0 \
						FROM playlists \
						LEFT JOIN playlist_songs USING (playlist_id) \
						WHERE video_id IS NULL"
					)

					sharedUtils.arrayShuffle(playlists)

					playlists = playlists.map(p => {
						p.ranking = "" // higher ascii value is better

						if (p.author == cmd.author.id) addRanking(1, p)
						else addRanking(0, p)
						if (p.count == 0) addRanking(0, p)
						else addRanking(1, p)
						addRanking(p.play_count.toString().padStart(8, "0"), p)

						return p
					}).sort((a, b) => {
						if (a.ranking < b.ranking) return 1
						else if (b.ranking < a.ranking) return -1
						else return 0
					})

					const users = await Promise.all(playlists.map(p => getAuthor(p.author, lang)))
					return sharedUtils.createPagination(
						cmd,
						lang
						, [lang.GLOBAL.HEADER_PLAYLIST, lang.GLOBAL.HEADER_SONGS, lang.GLOBAL.HEADER_LENGTH, lang.GLOBAL.HEADER_PLAY_COUNT, lang.GLOBAL.HEADER_AUTHOR]
						, playlists.map((p, index) => [
							p.name
							, String(p.count)
							, sharedUtils.prettySeconds(p.length)
							, p.play_count.toString()
							, users[index]
						])
						, ["left", "right", "right", "right", "none"]
						, 2000
						, snow
					)
				} else if (optionInfo !== null) {


					if (!checkPlaylistName(optionInfo, cmd, lang)) return

					const playlistRow = await sql.orm.get("playlists", { name: optionInfo })
					if (!playlistRow) {
						return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
							content: lang.GLOBAL.PLAYLIST_NOT_EXIST
						})
					}

					const user = await sharedUtils.getUser(playlistRow.author, snow)
					const authorText = user
						? `${sharedUtils.userString(user)} — ${optionInfo}`
						: optionInfo
					const authorIcon = user
						? sharedUtils.displayAvatarURL(user, user.id === cmd.author.id ? cmd.member : undefined, user.id === cmd.author.id ? cmd.guild_id : undefined, true) + "?size=32"
						: void 0

					const a: APIEmbedAuthor = { name: authorText }
					if (authorIcon) a.url = authorIcon

					const orderedTracks = await getTracks(playlistRow, cmd, lang)

					const rows = orderedTracks.map((s, index) => `${index + 1}. **${s.name}** (${sharedUtils.prettySeconds(s.length)})`)
					const totalLength = `\n${sharedUtils.prettySeconds(orderedTracks.reduce((acc, cur) => (acc + cur.length), 0))}`

					if (rows.length <= 22 && rows.join("\n").length + totalLength.length <= 2000) {
						return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
							embeds: [
								{
									author: a,
									color: confprovider.config.standard_embed_color,
									description: rows.join("\n") + totalLength
								}
							]
						})
					} else {
						const pages: Array<Array<string>> = []
						let currentPage: Array<string> = []
						let currentPageLength = 0
						const currentPageMaxLength = 2000 - totalLength.length
						const itemsPerPage = 20
						const itemsPerPageTolerance = 2

						for (let i = 0; i < rows.length; i++) {
							const row = rows[i]

							const isGreater = currentPage.length >= itemsPerPage && rows.length - i > itemsPerPageTolerance
							if (isGreater || currentPageLength + row.length + 1 > currentPageMaxLength) {
								pages.push(currentPage)
								currentPage = []
								currentPageLength = 0
							}

							currentPage.push(row)
							currentPageLength += row.length + 1
						}

						pages.push(currentPage)

						return sharedUtils.paginate(pages.length, (page, menu) => {
							return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
								embeds: [
									{
										author: a,
										color: confprovider.config.standard_embed_color,
										description: pages[page].join("\n") + totalLength,
										footer: { text: `${page + 1} - ${pages.length}` }
									}
								],
								components: menu
									? [{ type: 1, components: [menu.component] }]
									: []
							})
						})
					}
				} else if (optionCreate !== null) {


					if (!checkPlaylistName(optionCreate, cmd, lang)) return

					const playlistRow = await sql.orm.get("playlists", { name: optionCreate })
					if (playlistRow) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_ALREADY_EXISTS })

					await sql.orm.insert("playlists", {
						name: optionCreate,
						author: cmd.author.id
					})

					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_CREATED
					})
				} else if (optionDelete !== null) {


					if (!checkPlaylistName(optionDelete, cmd, lang)) return

					const playlistRow = await sql.orm.get("playlists", { name: optionDelete })

					if (!playlistRow) {
						return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
							content: lang.GLOBAL.PLAYLIST_NOT_EXIST
						})
					}

					if (playlistRow.author !== cmd.author.id) {
						return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
							content: lang.GLOBAL.PLAYLIST_CANNOT_MANAGE
						})
					}

					await Promise.all([
						sql.orm.delete("playlists", { playlist_id: playlistRow.playlist_id }),
						sql.orm.delete("playlist_songs", { playlist_id: playlistRow.playlist_id })
					])

					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_DELETED
					})
				}
			} else if (optionAdd !== null) {


				const optionPlaylist = optionAdd.options.get("playlist")!.asString()!
				const optionTrack = optionAdd.options.get("track")!.asString()!

				if (!checkPlaylistName(optionPlaylist, cmd, lang)) return

				const playlistRow = await sql.orm.get("playlists", { name: optionPlaylist })
				if (!playlistRow) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_NOT_EXIST
					})
				}

				if (playlistRow.author !== cmd.author.id) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_CANNOT_MANAGE
					})
				}

				let result: TrackInfo | undefined = void 0
				try {
					const res = await common.loadtracks(optionTrack, lang)

					if (res.loadType === "track") result = res.data.info
					else if (res.loadType === "playlist") result = res.data.tracks[0]?.info
					else if (res.loadType === "search") result = res.data[0]?.info
				} catch (e) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: e.message
					})
				}

				if (!result) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.NO_RESULTS
					})
				}

				const orderedTracks = await getTracks(playlistRow, cmd, lang)
				if (orderedTracks.some(row => row.video_id == result!.identifier)) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_DUPLICATE_SONG
					})
				}

				await Promise.all([
					sql.raw(
						"INSERT INTO songs SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM songs WHERE video_id = $1)",
						[result.identifier, result.title, Math.floor(result.length / 1000)]
					),
					sql.orm.insert("playlist_songs", {
						playlist_id: playlistRow.playlist_id,
						video_id: result.identifier,
						next: null
					}),
					sql.raw(
						"UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND next IS NULL AND video_id != $1",
						[result.identifier, playlistRow.playlist_id]
					)
				])

				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.PLAYLIST_SONG_ADDED, { "title": result.title })
				})
			} else if (optionRemove !== null) {


				const optionPlaylist = optionRemove.options.get("playlist")!.asString()!
				const optionIndex = optionRemove.options.get("index")!.asNumber()!

				if (!checkPlaylistName(optionPlaylist, cmd, lang)) return

				const playlistRow = await sql.orm.get("playlists", { name: optionPlaylist })
				if (!playlistRow) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_NOT_EXIST
					})
				}

				if (playlistRow.author !== cmd.author.id) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_CANNOT_MANAGE
					})
				}

				const orderedTracks = await getTracks(playlistRow, cmd, lang)
				const toRemove = orderedTracks[optionIndex - 1]
				if (!toRemove) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.OUT_OF_BOUNDS
					})
				}

				await Promise.all([
					sql.orm.update("playlist_songs", { next: toRemove.next }, { playlist_id: toRemove.playlist_id, next: toRemove.video_id }),
					sql.orm.delete("playlist_songs", { playlist_id: playlistRow.playlist_id, video_id: toRemove.video_id })
				])

				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.SONG_REMOVED, { "title": toRemove.name })
				})
			} else if (optionMove !== null) {


				const optionPlaylist = optionMove.options.get("playlist")!.asString()!
				const optionFrom = optionMove.options.get("from")!.asNumber()!
				const optionTo = optionMove.options.get("to")!.asNumber()!

				if (!checkPlaylistName(optionPlaylist, cmd, lang)) return

				const playlistRow = await sql.orm.get("playlists", { name: optionPlaylist })
				if (!playlistRow) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_NOT_EXIST
					})
				}

				if (playlistRow.author !== cmd.author.id) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_CANNOT_MANAGE
					})
				}

				const orderedTracks = await getTracks(playlistRow, cmd, lang)
				if (!orderedTracks[optionFrom] || !orderedTracks[optionTo]) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.OUT_OF_BOUNDS
					})
				}

				const fromRow = orderedTracks[optionFrom], toRow = orderedTracks[optionTo]
				if (optionFrom < optionTo) {
					await sql.orm.update("playlist_songs", { next: fromRow.next }, {
						playlist_id: fromRow.playlist_id,
						next: fromRow.video_id
					}) // update row before item

					await sql.orm.update("playlist_songs", { next: toRow.next }, {
						playlist_id: fromRow.playlist_id,
						video_id: fromRow.video_id
					}) // update moved item

					await sql.orm.update("playlist_songs", { next: fromRow.video_id }, {
						playlist_id: fromRow.playlist_id,
						video_id: toRow.video_id
					}) // update row before moved item
				} else if (optionFrom > optionTo) {
					await sql.orm.update("playlist_songs", { next: fromRow.next }, {
						playlist_id: fromRow.playlist_id,
						next: fromRow.video_id
					}) // update row before item

					await sql.orm.update("playlist_songs", { next: fromRow.video_id }, {
						playlist_id: fromRow.playlist_id,
						next: toRow.video_id
					}) // update row before moved item

					await sql.orm.update("playlist_songs", { next: toRow.video_id }, {
						playlist_id: fromRow.playlist_id,
						video_id: fromRow.video_id
					}) // update moved item
				} else {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_INDEXES_EQUAL
					})
				}

				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.PLAYLIST_SONG_MOVED
				})
			} else if (optionSearch !== null) {


				const optionPlaylist = optionSearch.options.get("playlist")!.asString()!
				const optionQuery = optionSearch.options.get("query")!.asString()!

				const playlistRow = await sql.orm.get("playlists", { name: optionPlaylist })
				if (!playlistRow) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_NOT_EXIST
					})
				}

				const orderedTracks = await getTracks(playlistRow, cmd, lang)

				let body = orderedTracks
					.map((trackss, index) => `${index + 1}. **${trackss.name}** (${sharedUtils.prettySeconds(trackss.length)})`)
					.filter(s => s.toLowerCase().includes(optionQuery.toLowerCase()))
					.join("\n")

				if (body.length > 2000) body = `${body.slice(0, 1998).split("\n").slice(0, -1).join("\n")}\n…`

				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							description: body,
							color: confprovider.config.standard_embed_color
						}
					]
				})
			} else if (optionPlay !== null) {


				const optionPlaylist = optionPlay.options.get("playlist")!.asString()!
				const optionShuffle = optionPlay.options.get("shuffle")?.asBoolean() ?? false
				const optionStart = optionPlay.options.get("start")?.asNumber() ?? 1

				const playlistRow = await sql.orm.get("playlists", { name: optionPlaylist })
				if (!playlistRow) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_NOT_EXIST
					})
				}

				const orderedTracks = await getTracks(playlistRow, cmd, lang)
				if (orderedTracks.length === 0) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: lang.GLOBAL.PLAYLIST_EMPTY
					})
				}

				let queue = queues.get(cmd.guild_id!) ?? null

				const userVoiceState = await sql.orm.get("voice_states", {
					user_id: cmd.author.id,
					guild_id: cmd.guild_id!
				})

				if (!userVoiceState) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: langReplace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username })
					})
				}

				if (queue?.voiceChannelID && userVoiceState.channel_id !== queue.voiceChannelID) {
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: langReplace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` })
					})
				}

				const node = queue?.node
					? common.nodes.byID(queue.node) ?? common.nodes.byIdeal() ?? common.nodes.random()
					: common.nodes.byIdeal() ?? common.nodes.random()

				if (!queue) {
					queue = await common.queues.createQueue(cmd, lang, userVoiceState.channel_id, node.id)
					if (!queue) return
				}

				const sliced = orderedTracks.slice(optionStart - 1)
				const trackss = (optionShuffle
					? sharedUtils.arrayShuffle(sliced)
					: sliced)
					.map(row => new trackTypes.RequiresSearchTrack(
						"!",
						{
							title: row.name,
							length: row.length * 1000,
							identifier: row.video_id
						},
						row.video_id,
						cmd.author,
						sharedUtils.getLang(cmd.guild_locale!)
					))

				for (const track of trackss) {
					queue.addTrack(track)
				}

				queue.interaction = cmd
			}
		}
	}
])
