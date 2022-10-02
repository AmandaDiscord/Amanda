import passthrough from "../../passthrough"
const { client, commands, constants, sync, queues } = passthrough

const common = sync.require("./utils") as typeof import("./utils")
const queueFile = sync.require("./queue") as typeof import("./queue")
const trackTypes = sync.require("./tracktypes") as typeof import("./tracktypes")

const arr = sync.require("../../utils/array") as typeof import("../../utils/array")
const discordUtils = sync.require("../../utils/discord") as typeof import("../../utils/discord")
const orm = sync.require("../../utils/orm") as typeof import("../../utils/orm")
const language = sync.require("../../utils/language") as typeof import("../../utils/language")
const logger = sync.require("../../utils/logger") as typeof import("../../utils/logger")
const text = sync.require("../../utils/string") as typeof import("../../utils/string")
const time = sync.require("../../utils/time") as typeof import("../../utils/time")

const musicDisabled = false as boolean
const waitForClientVCJoinTimeout = 5000
const plRegex = /PL[A-Za-z0-9_-]{16,}/

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
			if (musicDisabled) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "Working on fixing currently. This is a lot harder than people think" } })
			if (!cmd.guild_id) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: lang.GLOBAL.GUILD_ONLY } })
			const optionMeta = (cmd.data?.options?.find(o => o.name === "meta") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeSub) ?? null
			const optionAdd = (cmd.data?.options?.find(o => o.name === "add") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeSub) ?? null
			const optionRemove = (cmd.data?.options?.find(o => o.name === "remove") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeSub) ?? null
			const optionMove = (cmd.data?.options?.find(o => o.name === "move") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeSub) ?? null
			const optionSearch = (cmd.data?.options?.find(o => o.name === "search") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeSub) ?? null
			const optionPlay = (cmd.data?.options?.find(o => o.name === "play") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeSub) ?? null

			const array = [
				optionMeta,
				optionAdd,
				optionRemove,
				optionMove,
				optionSearch,
				optionPlay
			]

			const author = cmd.user ? cmd.user : cmd.member!.user

			const notNull = array.filter(i => i !== null)

			if (notNull.length === 0) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.MUSIC_INVALID_ACTION, { username: author.username }) } })
			if (notNull.length > 1) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "You can only do 1 action at a time" } })

			const checkPlaylistName = (playlistName: string) => {
				let value = true
				if (playlistName.includes("http") || playlistName.includes("www.") || playlistName.match(plRegex)) value = false
				if (playlistName.length > 24) value = false
				if (!value) client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Invalid playlist name. Playlist names must not contain a link or be longer than 24 characters" })
				return value
			}
			const getTracks = async (playlistRow: import("../../types").InferModelDef<typeof import("../../utils/orm")["db"]["tables"]["playlists"]>) => {
				const tracks = await orm.db.raw("SELECT * FROM playlist_songs INNER JOIN songs ON songs.video_id = playlist_songs.video_id WHERE playlist_id = $1", [playlistRow.playlist_id]) as Array<import("../../types").InferModelDef<typeof import("../../utils/orm")["db"]["tables"]["playlist_songs"]> & { name: string; length: number; }>
				const unbreakDatabase = async () => {
					logger.warn("unbreakDatabase was called!")
					await Promise.all(tracks.map((row, index) => orm.db.update("playlist_songs", { next: (tracks[index + 1] ? tracks[index + 1].video_id : null) }, { playlist_id: row.playlist_id, video_id: row.video_id })))
					return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "lang.audio.playlist.prompts.databaseFixed" })
				}
				if (tracks.length === 0) {
					client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist is empty" })
					return []
				}
				const orderedTracks = [] as typeof tracks
				let track = tracks.find(row => !tracks.some(r => r.next == row.video_id))
				while (track) {
					orderedTracks.push(track!)
					if (track.next) track = tracks.find(row => row.video_id == track!.next)
					else track = undefined
					if (orderedTracks.includes(track!)) await unbreakDatabase()
				}
				if (orderedTracks.length != tracks.length) await unbreakDatabase()
				return orderedTracks
			}

			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })

			if (optionMeta !== null) {


				const optionShow = (optionMeta.options.find(o => o.name === "show") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? null
				const optionInfo = (optionMeta.options.find(o => o.name === "info") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)?.value ?? null
				const optionCreate = (optionMeta.options.find(o => o.name === "create") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)?.value ?? null
				const optionDelete = (optionMeta.options.find(o => o.name === "delete") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)?.value ?? null

				const array2 = [
					optionShow,
					optionInfo,
					optionCreate,
					optionDelete
				]

				const notNull2 = array2.filter(i => i !== null)
				if (notNull2.length === 0) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_INVALID_ACTION, { username: author.username }) })
				if (notNull2.length > 1) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You can only do 1 action at a time" })

				if (optionShow !== null) {


					let playlists = await orm.db.raw(
						"SELECT playlists.playlist_id, playlists.name, playlists.author, playlists.play_count, count(*) as count, sum(songs.length) as length \
						FROM playlist_songs \
						INNER JOIN songs USING (video_id) INNER JOIN playlists USING (playlist_id) \
						GROUP BY playlists.playlist_id \
						UNION \
						SELECT playlists.playlist_id, playlists.name, playlists.author, playlists.play_count, 0, 0 \
						FROM playlists \
						LEFT JOIN playlist_songs USING (playlist_id) \
						WHERE video_id IS NULL"
					) as Array<{ playlist_id: string; name: string; author: string; play_count: number; count: number; length: number; ranking: string; }>
					arr.shuffle(playlists)
					playlists = playlists.map(p => {
						p.ranking = "" // higher ascii value is better
						function addRanking(r: number | string) {
							p.ranking += `${r}.`
						}
						if (p.author == author.id) addRanking(1)
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
					// eslint-disable-next-line no-inner-declarations
					async function getAuthor(u: string) {
						const user = await discordUtils.getUser(u).catch(() => void 0)
						if (user) {
							let username = user.username || "Unknown"
							if (username.length > 14) username = `${username.slice(0, 13)}…`
							return `\`${username}\``
						} else return "(?)"
					}
					const users = await Promise.all(playlists.map(p => getAuthor(p.author)))
					return discordUtils.createPagination(
						cmd
						, ["Playlist", "Tracks", "Length", "Plays", "`Author`"]
						, playlists.map((p, index) => [
							p.name
							, String(p.count)
							, time.prettySeconds(p.length)
							, p.play_count.toString()
							, users[index]
						])
						, ["left", "right", "right", "right", "none"]
						, 2000
					)
				} else if (optionInfo !== null) {


					if (!checkPlaylistName(optionInfo)) return

					const playlistRow = await orm.db.get("playlists", { name: optionInfo })
					if (!playlistRow) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist does not exist" })

					const authorDetails: Array<string> = []
					const user = await discordUtils.getUser(playlistRow.author)
					if (user) authorDetails.push(`${user.username}#${user.discriminator} — ${optionInfo}`, discordUtils.displayAvatarURL(user, true) + "?size=32")
					else authorDetails.push(optionInfo)

					const a: import("discord-typings").EmbedAuthor = { name: authorDetails[0] }
					if (authorDetails[1]) a.url = authorDetails[1]

					const orderedTracks = await getTracks(playlistRow)

					const rows = orderedTracks.map((s, index) => `${index + 1}. **${s.name}** (${time.prettySeconds(s.length)})`)
					const totalLength = `\n${time.prettySeconds(orderedTracks.reduce((acc, cur) => (acc + cur.length), 0))}`
					if (rows.length <= 22 && rows.join("\n").length + totalLength.length <= 2000) {
						return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
							embeds: [
								{
									author: a,
									color: constants.standard_embed_color,
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
							if ((currentPage.length >= itemsPerPage && rows.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
								pages.push(currentPage)
								currentPage = []
								currentPageLength = 0
							}
							currentPage.push(row)
							currentPageLength += row.length + 1
						}
						pages.push(currentPage)
						return discordUtils.paginate(pages.length, (page, menu) => {
							return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
								embeds: [
									{
										author: a,
										color: constants.standard_embed_color,
										description: pages[page].join("\n") + totalLength,
										footer: { text: `${page + 1} - ${pages.length}` }
									}
								],
								components: menu ? [{ type: 1, components: [menu.toComponent()] }] : []
							})
						})
					}
				} else if (optionCreate !== null) {


					if (!checkPlaylistName(optionCreate)) return

					const playlistRow = await orm.db.get("playlists", { name: optionCreate })
					if (playlistRow) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist already exists" })

					await orm.db.insert("playlists", { name: optionCreate, author: author.id })
					return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Playlist created" })
				} else if (optionDelete !== null) {


					if (!checkPlaylistName(optionDelete)) return

					const playlistRow = await orm.db.get("playlists", { name: optionDelete })
					if (!playlistRow) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist does not exist" })
					if (playlistRow.author !== author.id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You are not allowed to manage this playlist" })
					await Promise.all([
						orm.db.delete("playlists", { playlist_id: playlistRow.playlist_id }),
						orm.db.delete("playlist_songs", { playlist_id: playlistRow.playlist_id })
					])
					return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Playlist deleted" })
				}
			} else if (optionAdd !== null) {


				const optionPlaylist = (optionAdd.options.find(o => o.name === "playlist") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)!.value
				const optionTrack = (optionAdd.options.find(o => o.name === "track") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)!.value

				if (!checkPlaylistName(optionPlaylist)) return

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist does not exist" })
				if (playlistRow.author !== author.id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You are not allowed to manage this playlist" })

				const result = await common.loadtracks(`${optionTrack}`).then(d => d[0]?.info)

				if (!result) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "No results" })

				const orderedTracks = await getTracks(playlistRow)
				if (orderedTracks.some(row => row.video_id == result.identifier)) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You tried to add a duplicate track to your playlist" })

				await Promise.all([
					orm.db.raw("INSERT INTO songs SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM songs WHERE video_id = $1)", [result.identifier, result.title, Math.floor(result.length / 1000)]),
					orm.db.insert("playlist_songs", { playlist_id: playlistRow.playlist_id, video_id: result.identifier, next: null }),
					orm.db.raw("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND next IS NULL AND video_id != $1", [result.identifier, playlistRow.playlist_id])
				])
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${result.title} added` })
			} else if (optionRemove !== null) {


				const optionPlaylist = (optionRemove.options.find(o => o.name === "playlist") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)!.value
				const optionIndex = (optionRemove.options.find(o => o.name === "index") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeNumber)!.value

				if (!checkPlaylistName(optionPlaylist)) return

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist does not exist" })
				if (playlistRow.author !== author.id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You are not allowed to manage this playlist" })

				const orderedTracks = await getTracks(playlistRow)
				const toRemove = orderedTracks[optionIndex - 1]
				if (!toRemove) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Index out of bounds" })
				await Promise.all([
					orm.db.update("playlist_songs", { next: toRemove.next }, { playlist_id: toRemove.playlist_id, next: toRemove.video_id }),
					orm.db.delete("playlist_songs", { playlist_id: playlistRow.playlist_id, video_id: toRemove.video_id })
				])
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${toRemove.name} removed` })
			} else if (optionMove !== null) {


				const optionPlaylist = (optionMove.options.find(o => o.name === "playlist") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)!.value
				const optionFrom = (optionMove.options.find(o => o.name === "from") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeNumber)!.value
				const optionTo = (optionMove.options.find(o => o.name === "to") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeNumber)!.value

				if (!checkPlaylistName(optionPlaylist)) return

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist does not exist" })
				if (playlistRow.author !== author.id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You are not allowed to manage this playlist" })

				const orderedTracks = await getTracks(playlistRow)
				if (!orderedTracks[optionFrom] || !orderedTracks[optionTo]) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Index out of bounds" })
				const fromRow = orderedTracks[optionFrom], toRow = orderedTracks[optionTo]
				if (optionFrom < optionTo) {
					await orm.db.update("playlist_songs", { next: fromRow.next }, { playlist_id: fromRow.playlist_id, next: fromRow.video_id }) // update row before item
					await orm.db.update("playlist_songs", { next: toRow.next }, { playlist_id: fromRow.playlist_id, video_id: fromRow.video_id }) // update moved item
					await orm.db.update("playlist_songs", { next: fromRow.video_id }, { playlist_id: fromRow.playlist_id, video_id: toRow.video_id }) // update row before moved item
				} else if (optionFrom > optionTo) {
					await orm.db.update("playlist_songs", { next: fromRow.next }, { playlist_id: fromRow.playlist_id, next: fromRow.video_id }) // update row before item
					await orm.db.update("playlist_songs", { next: fromRow.video_id }, { playlist_id: fromRow.playlist_id, next: toRow.video_id }) // update row before moved item
					await orm.db.update("playlist_songs", { next: toRow.video_id }, { playlist_id: fromRow.playlist_id, video_id: fromRow.video_id }) // update moved item
				} else return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "The from and to indexes cannot be equal" })
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "Track moved" })
			} else if (optionSearch !== null) {


				const optionPlaylist = (optionSearch.options.find(o => o.name === "playlist") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)!.value
				const optionQuery = (optionSearch.options.find(o => o.name === "query") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)!.value

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist does not exist" })

				const orderedTracks = await getTracks(playlistRow)

				let body = orderedTracks
					.map((trackss, index) => `${index + 1}. **${trackss.name}** (${time.prettySeconds(trackss.length)})`)
					.filter(s => s.toLowerCase().includes(optionQuery.toLowerCase()))
					.join("\n")
				if (body.length > 2000) body = `${body.slice(0, 1998).split("\n").slice(0, -1).join("\n")}\n…`
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							description: body,
							color: constants.standard_embed_color
						}
					]
				})
			} else if (optionPlay !== null) {


				const optionPlaylist = (optionPlay.options.find(o => o.name === "playlist") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString)!.value
				const optionShuffle = (optionPlay.options.find(o => o.name === "show") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value ?? false
				const optionStart = (optionPlay.options.find(o => o.name === "start") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeNumber)?.value ?? 1

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist does not exist" })

				const orderedTracks = await getTracks(playlistRow)
				if (orderedTracks.length === 0) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "That playlist doesn't have any tracks to play" })

				let queue = queues.get(cmd.guild_id)
				const queueDidntExist = !queue

				const userVoiceState = await orm.db.get("voice_states", { user_id: author.id, guild_id: cmd.guild_id })
				if (!userVoiceState) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.VC_REQUIRED, { username: author.username }) })
				if (queue && queue.voiceChannelID && userVoiceState.channel_id !== queue.voiceChannelID) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })

				const createQueue = async () => {
					queue = new queueFile(cmd.guild_id!)
					queue.lang = cmd.guild_locale ? language.getLang(cmd.guild_locale) : lang
					queue.interaction = cmd
					client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						embeds: [
							{
								color: constants.standard_embed_color,
								description: language.replace(lang.GLOBAL.NOW_PLAYING, { "song": `[**${lang.GLOBAL.HEADER_LOADING}**](https://amanda.moe)\n\n\`[${text.progressBar(18, 60, 60, `[${lang.GLOBAL.HEADER_LOADING}]`)}]\`` })
							}
						]
					}).catch(() => void 0)
					try {
						let reject: (error?: unknown) => unknown
						const timer = setTimeout(() => reject?.("Timed out"), waitForClientVCJoinTimeout)
						const player = await new Promise<import("lavacord").Player | undefined>((resolve, rej) => {
							reject = rej
							client.lavalink!.join({ channel: userVoiceState.channel_id, guild: userVoiceState.guild_id }).then(p => {
								resolve(p)
								clearTimeout(timer)
							})
						})
						queue!.player = player
						queue!.addPlayerListeners()
						return true
					} catch (e) {
						if (e !== "Timed out") logger.error(e)
						queue!.destroy()
						queue = undefined
						client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${language.replace(lang.GLOBAL.VC_NOT_JOINABLE, { username: author.username })}\n${await text.stringify(e)}` }).catch(() => void 0)
						return false
					}
				}
				if (!queue) {
					await createQueue().catch(() => void 0)
					if (!queue) return
				}

				const sliced = orderedTracks.slice(optionStart - 1)
				const trackss = (optionShuffle ? arr.shuffle(sliced) : sliced).map(row => new trackTypes.RequiresSearchTrack("!", { title: row.name, length: BigInt(row.length), identifier: row.video_id }))
				for (const track of trackss) {
					await queue.addTrack(track)
				}
				if (queueDidntExist) queue.play()
				else queue.interaction = cmd
			}
		}
	}
])
