import { BetterComponent } from "callback-components"

import passthrough from "../../passthrough"
const { client, commands, constants, sync, queues, config } = passthrough

const common = sync.require("./utils") as typeof import("./utils")
const queueFile = sync.require("./queue") as typeof import("./queue")
const songTypes = sync.require("./songtypes") as typeof import("./songtypes")

const arr = sync.require("../../utils/array") as typeof import("../../utils/array")
const discordUtils = sync.require("../../utils/discord") as typeof import("../../utils/discord")
const orm = sync.require("../../utils/orm") as typeof import("../../utils/orm")
const language = sync.require("../../utils/language") as typeof import("../../utils/language")
const text = sync.require("../../utils/string") as typeof import("../../utils/string")
const time = sync.require("../../utils/time") as typeof import("../../utils/time")

const musicDisabled = false as boolean

commands.assign([
	{
		name: "playlists",
		description: "Manage and play Amanda playlists",
		category: "audio",
		options: [
			{
				name: "show",
				description: "Shows all Amanda playlists. True to only show yourself",
				type: 5,
				required: false
			}
		],
		async process(cmd, lang) {
			if (musicDisabled) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "Working on fixing currently. This is a lot harder than people think" } })
			if (!cmd.guild_id) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: lang.GLOBAL.GUILD_ONLY } })
			const optionShow = (cmd.data?.options?.find(o => o.name === "show") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeBoolean)?.value || null

			const array = [
				optionShow
			]

			const author = cmd.user ? cmd.user : cmd.member!.user

			const notNull = array.filter(i => i !== null)

			if (notNull.length === 0) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.MUSIC_INVALID_ACTION, { username: author.username }) } })
			if (notNull.length > 1) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "You can only do 1 action at a time" } })

			if (optionShow !== null) {
				await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })
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
					, ["Playlist", "Songs", "Length", "Plays", "`Author`"]
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
			}
		}
	}
])
