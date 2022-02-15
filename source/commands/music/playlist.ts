import Discord from "thunderstorm"
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
				type: Discord.Constants.ApplicationCommandOptionTypes.BOOLEAN,
				required: false
			}
		],
		async process(cmd, lang) {
			if (musicDisabled) return cmd.reply("Working on fixing currently. This is a lot harder than people think")
			if (!cmd.guildId || !cmd.guild) return cmd.reply(lang.audio.music.prompts.guildOnly)
			const optionShow = cmd.options.getBoolean("show", false)

			const array = [
				optionShow
			]

			const notNull = array.filter(i => i !== null)

			if (notNull.length === 0) return cmd.reply(language.replace(lang.audio.music.prompts.invalidAction, { username: cmd.user.username }))
			if (notNull.length > 1) return cmd.reply("You can only do 1 action at a time")

			if (optionShow !== null) {
				await cmd.defer()
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
					if (p.author == cmd.user.id) addRanking(1)
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
				async function getAuthor(author: string) {
					const user = await discordUtils.getUser(author).catch(() => void 0)
					if (user) {
						let username = user.username || "Unknown"
						if (username.length > 14) username = `${username.slice(0, 13)}…`
						return `\`${Discord.Util.escapeMarkdown(username)}\``
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
