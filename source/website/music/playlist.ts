import passthrough from "../../passthrough"
const { snow, commands, constants, sync, queues, config, lavalink, joiningGuildShardMap } = passthrough

const common: typeof import("./utils") = sync.require("./utils")
const queueFile: typeof import("./queue") = sync.require("./queue")
const trackTypes: typeof import("./tracktypes") = sync.require("./tracktypes")

const arr: typeof import("../../client/utils/array") = sync.require("../../client/utils/array")
const discordUtils: typeof import("../../client/utils/discord") = sync.require("../../client/utils/discord")
const orm: typeof import("../../client/utils/orm") = sync.require("../../client/utils/orm")
const language: typeof import("../../client/utils/language") = sync.require("../../client/utils/language")
const text: typeof import("../../client/utils/string") = sync.require("../../client/utils/string")
const time: typeof import("../../client/utils/time") = sync.require("../../client/utils/time")

const musicDisabled = false as boolean
const waitForClientVCJoinTimeout = 5000
const plRegex = /PL[A-Za-z0-9_-]{16,}/

commands.assign([
	{
		name: "playlists",
		description: "Manage and play Amanda playlists",
		category: "audio",
		async process(cmd, lang, info) {
			if (!config.db_enabled) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.DATABASE_OFFLINE })
			if (musicDisabled) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.MUSIC_DISABLED })
			if (!cmd.guild_id) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.GUILD_ONLY })
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

			if (notNull.length === 0) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_INVALID_ACTION, { username: cmd.author.username }) })
			if (notNull.length > 1) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.ONE_ACTION })

			const checkPlaylistName = (playlistName: string) => {
				let value = true
				if (playlistName.includes("http") || playlistName.includes("www.") || playlistName.match(plRegex)) value = false
				if (playlistName.length > 24) value = false
				if (!value) snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.INVALID_PLAYLIST_NAME })
				return value
			}
			const getTracks = async (playlistRow: import("../../types").InferModelDef<typeof import("../../client/utils/orm")["db"]["tables"]["playlists"]>) => {
				const tracks = await orm.db.raw("SELECT * FROM playlist_songs INNER JOIN songs ON songs.video_id = playlist_songs.video_id WHERE playlist_id = $1", [playlistRow.playlist_id]) as Array<import("../../types").InferModelDef<typeof import("../../client/utils/orm")["db"]["tables"]["playlist_songs"]> & { name: string; length: number; }>
				const unbreakDatabase = async () => {
					console.warn("unbreakDatabase was called!")
					await Promise.all(tracks.map((row, index) => orm.db.update("playlist_songs", { next: (tracks[index + 1] ? tracks[index + 1].video_id : null) }, { playlist_id: row.playlist_id, video_id: row.video_id })))
				}
				if (tracks.length === 0) {
					snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_EMPTY })
					return []
				}
				const orderedTracks: typeof tracks = []
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
				if (notNull2.length === 0) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_INVALID_ACTION, { username: cmd.author.username }) })
				if (notNull2.length > 1) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.ONE_ACTION })

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
						if (p.author == cmd.author.id) addRanking(1)
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
							let username = user.username || lang.GLOBAL.HEADER_UNKNOWN
							if (username.length > 14) username = `${username.slice(0, 13)}…`
							return `\`${username}\``
						} else return "(?)"
					}
					const users = await Promise.all(playlists.map(p => getAuthor(p.author)))
					return discordUtils.createPagination(
						cmd,
						lang
						, [lang.GLOBAL.HEADER_PLAYLIST, lang.GLOBAL.HEADER_SONGS, lang.GLOBAL.HEADER_LENGTH, lang.GLOBAL.HEADER_PLAY_COUNT, lang.GLOBAL.HEADER_AUTHOR]
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
					if (!playlistRow) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_NOT_EXIST })

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
						return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
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
							return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
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
					if (playlistRow) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_ALREADY_EXISTS })

					await orm.db.insert("playlists", { name: optionCreate, author: cmd.author.id })
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_CREATED })
				} else if (optionDelete !== null) {


					if (!checkPlaylistName(optionDelete)) return

					const playlistRow = await orm.db.get("playlists", { name: optionDelete })
					if (!playlistRow) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_NOT_EXIST })
					if (playlistRow.author !== cmd.author.id) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_CANNOT_MANAGE })
					await Promise.all([
						orm.db.delete("playlists", { playlist_id: playlistRow.playlist_id }),
						orm.db.delete("playlist_songs", { playlist_id: playlistRow.playlist_id })
					])
					return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_DELETED })
				}
			} else if (optionAdd !== null) {


				const optionPlaylist = optionAdd.options.get("playlist")!.asString()!
				const optionTrack = optionAdd.options.get("track")!.asString()!

				if (!checkPlaylistName(optionPlaylist)) return

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_NOT_EXIST })
				if (playlistRow.author !== cmd.author.id) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_CANNOT_MANAGE })

				const result = await common.loadtracks(`${optionTrack}`).then(d => d[0]?.info)

				if (!result) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.NO_RESULTS })

				const orderedTracks = await getTracks(playlistRow)
				if (orderedTracks.some(row => row.video_id == result.identifier)) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_DUPLICATE_SONG })

				await Promise.all([
					orm.db.raw("INSERT INTO songs SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM songs WHERE video_id = $1)", [result.identifier, result.title, Math.floor(result.length / 1000)]),
					orm.db.insert("playlist_songs", { playlist_id: playlistRow.playlist_id, video_id: result.identifier, next: null }),
					orm.db.raw("UPDATE playlist_songs SET next = $1 WHERE playlist_id = $2 AND next IS NULL AND video_id != $1", [result.identifier, playlistRow.playlist_id])
				])
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.PLAYLIST_SONG_ADDED, { "title": result.title }) })
			} else if (optionRemove !== null) {


				const optionPlaylist = optionRemove.options.get("playlist")!.asString()!
				const optionIndex = optionRemove.options.get("index")!.asNumber()!

				if (!checkPlaylistName(optionPlaylist)) return

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_NOT_EXIST })
				if (playlistRow.author !== cmd.author.id) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_CANNOT_MANAGE })

				const orderedTracks = await getTracks(playlistRow)
				const toRemove = orderedTracks[optionIndex - 1]
				if (!toRemove) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.OUT_OF_BOUNDS })
				await Promise.all([
					orm.db.update("playlist_songs", { next: toRemove.next }, { playlist_id: toRemove.playlist_id, next: toRemove.video_id }),
					orm.db.delete("playlist_songs", { playlist_id: playlistRow.playlist_id, video_id: toRemove.video_id })
				])
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.PLAYLIST_SONG_REMOVED, { "title": toRemove.name }) })
			} else if (optionMove !== null) {


				const optionPlaylist = optionMove.options.get("playlist")!.asString()!
				const optionFrom = optionMove.options.get("from")!.asNumber()!
				const optionTo = optionMove.options.get("to")!.asNumber()!

				if (!checkPlaylistName(optionPlaylist)) return

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_NOT_EXIST })
				if (playlistRow.author !== cmd.author.id) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_CANNOT_MANAGE })

				const orderedTracks = await getTracks(playlistRow)
				if (!orderedTracks[optionFrom] || !orderedTracks[optionTo]) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.OUT_OF_BOUNDS })
				const fromRow = orderedTracks[optionFrom], toRow = orderedTracks[optionTo]
				if (optionFrom < optionTo) {
					await orm.db.update("playlist_songs", { next: fromRow.next }, { playlist_id: fromRow.playlist_id, next: fromRow.video_id }) // update row before item
					await orm.db.update("playlist_songs", { next: toRow.next }, { playlist_id: fromRow.playlist_id, video_id: fromRow.video_id }) // update moved item
					await orm.db.update("playlist_songs", { next: fromRow.video_id }, { playlist_id: fromRow.playlist_id, video_id: toRow.video_id }) // update row before moved item
				} else if (optionFrom > optionTo) {
					await orm.db.update("playlist_songs", { next: fromRow.next }, { playlist_id: fromRow.playlist_id, next: fromRow.video_id }) // update row before item
					await orm.db.update("playlist_songs", { next: fromRow.video_id }, { playlist_id: fromRow.playlist_id, next: toRow.video_id }) // update row before moved item
					await orm.db.update("playlist_songs", { next: toRow.video_id }, { playlist_id: fromRow.playlist_id, video_id: fromRow.video_id }) // update moved item
				} else return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_INDEXES_EQUAL })
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_SONG_MOVED })
			} else if (optionSearch !== null) {


				const optionPlaylist = optionSearch.options.get("playlist")!.asString()!
				const optionQuery = optionSearch.options.get("query")!.asString()!

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_NOT_EXIST })

				const orderedTracks = await getTracks(playlistRow)

				let body = orderedTracks
					.map((trackss, index) => `${index + 1}. **${trackss.name}** (${time.prettySeconds(trackss.length)})`)
					.filter(s => s.toLowerCase().includes(optionQuery.toLowerCase()))
					.join("\n")
				if (body.length > 2000) body = `${body.slice(0, 1998).split("\n").slice(0, -1).join("\n")}\n…`
				return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							description: body,
							color: constants.standard_embed_color
						}
					]
				})
			} else if (optionPlay !== null) {


				const optionPlaylist = optionPlay.options.get("playlist")!.asString()!
				const optionShuffle = optionPlay.options.get("shuffle")?.asBoolean() ?? false
				const optionStart = optionPlay.options.get("start")?.asNumber() ?? 1

				const playlistRow = await orm.db.get("playlists", { name: optionPlaylist })
				if (!playlistRow) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_NOT_EXIST })

				const orderedTracks = await getTracks(playlistRow)
				if (orderedTracks.length === 0) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.PLAYLIST_EMPTY })

				let queue = queues.get(cmd.guild_id) ?? null
				const queueDidntExist = !queue

				const userVoiceState = await orm.db.get("voice_states", { user_id: cmd.author.id, guild_id: cmd.guild_id })
				if (!userVoiceState) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username }) })
				if (queue && queue.voiceChannelID && userVoiceState.channel_id !== queue.voiceChannelID) return snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` }) })

				const node = (queue && queue.node ? common.nodes.byID(queue.node) || common.nodes.byIdeal() || common.nodes.random() : common.nodes.byIdeal() || common.nodes.random())
				if (!queue) {
					queue = await createQueue(cmd, lang, userVoiceState.channel_id, node.id, info.shard_id).catch(() => null)
					if (!queue) return
				}

				const sliced = orderedTracks.slice(optionStart - 1)
				const trackss = (optionShuffle ? arr.shuffle(sliced) : sliced).map(row => new trackTypes.RequiresSearchTrack("!", { title: row.name, length: BigInt(row.length * 1000), identifier: row.video_id }, row.video_id, cmd.author, language.getLang(cmd.guild_locale!)))
				for (const track of trackss) {
					await queue.addTrack(track)
				}
				if (queueDidntExist || !queue.playHasBeenCalled) queue.play()
				else queue.interaction = cmd
			}
		}
	}
])

async function createQueue(cmd: import("../../client/modules/Command"), lang: import("@amanda/lang").Lang, channel: string, node: string, shardID: number): Promise<import("./queue").Queue | null> {
	const queue = new queueFile.Queue(cmd.guild_id!)
	queue.lang = cmd.guild_locale ? language.getLang(cmd.guild_locale) : lang
	queue.interaction = cmd
	snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
		embeds: [
			{
				color: constants.standard_embed_color,
				description: language.replace(lang.GLOBAL.NOW_PLAYING, { "song": `[**${lang.GLOBAL.HEADER_LOADING}**](https://amanda.moe)\n\n\`[${text.progressBar(18, 60, 60, `[${lang.GLOBAL.HEADER_LOADING}]`)}]\`` })
			}
		]
	}).catch(() => void 0)
	try {
		let reject: (error?: unknown) => unknown
		const timer = setTimeout(() => reject(lang.GLOBAL.TIMED_OUT), waitForClientVCJoinTimeout)
		const player = await new Promise<import("lavacord").Player | undefined>((resolve, rej) => {
			reject = rej
			joiningGuildShardMap.set(cmd.guild_id!, shardID)
			lavalink!.join({ channel: channel, guild: cmd.guild_id!, node }).then(p => {
				resolve(p)
				clearTimeout(timer)
			})
		})
		queue!.node = node
		queue!.player = player
		queue!.addPlayerListeners()
		return queue
	} catch (e) {
		if (e !== lang.GLOBAL.TIMED_OUT) console.error(e)
		queue!.destroy()
		snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${language.replace(lang.GLOBAL.VC_NOT_JOINABLE, { username: cmd.author.username })}\n${await text.stringify(e)}` }).catch(() => void 0)
		return null
	}
}
