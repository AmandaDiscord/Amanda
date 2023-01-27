import { BetterComponent } from "callback-components"
const encoding = require("@lavalink/encoding") as typeof import("@lavalink/encoding")

import passthrough from "../../passthrough"
const { constants, sync, config, lavalink, snow } = passthrough

const arr = sync.require("../../client/utils/array") as typeof import("../../client/utils/array")
const timeUtils = sync.require("../../client/utils/time") as typeof import("../../client/utils/time")
const language = sync.require("../../client/utils/language") as typeof import("../../client/utils/language")

const selectTimeout = 1000 * 60

const trackNameRegex = /([^|[\]]+?) ?(?:[-–—]|\bby\b) ?([^()[\],]+)?/ // (Toni Romiti) - (Switch Up )\(Ft. Big Rod\) | Non escaped () means cap group
const hiddenEmbedRegex = /(^<|>$)/g

type Key = Exclude<keyof typeof import("./tracktypes"), "FriskyTrack" | "ListenMoeTrack" | "default">

const sourceMap = new Map<string, Key>([
	["soundcloud", "Track"],
	["newgrounds", "Track"],
	["twitter", "Track"],
	["itunes", "RequiresSearchTrack"],
	["spotify", "RequiresSearchTrack"],
	["http", "ExternalTrack"]
])

const common = {
	nodes: {
		random() {
			const filtered = constants.lavalinkNodes.filter(n => n.enabled)
			return arr.random(filtered)
		},

		byID(id: string) {
			return constants.lavalinkNodes.find(n => n.id === id && n.enabled) || null
		},

		byIdeal() {
			const node = lavalink!.idealNodes[0]
			return common.nodes.byID(node.id)
		}
	},

	genius: {
		getLyrics(title: string, artist: string | undefined = undefined): Promise<string | null> {
			return fetch(`https://some-random-api.ml/lyrics?title=${encodeURIComponent(`${artist} - ${title}`)}`).then(d => d.json()).then(j => j.lyrics || j.error || null)
		},

		pickApart(track: import("./tracktypes").Track) {
			let title = "", artist: string | undefined

			const match = track.title.match(trackNameRegex)
			if (match) {
				title = match[2]
				artist = match[1]
			}
			if (!title || !artist) {
				title = track.title
				artist = track.author
			}

			return { title, artist }
		}
	},

	async inputToTrack(resource: string, cmd: import("../../client/modules/Command"), lang: import("@amanda/lang").Lang, node?: string): Promise<Array<import("./tracktypes").Track> | null> {
		resource = resource.replace(hiddenEmbedRegex, "")

		const tracks = await common.loadtracks(resource, node).catch(e => {
			const reportTarget = "512869106089852949"
			const undef = "undefined"
			const details = [
				["Tree", config.cluster_id],
				["Branch", String(cmd.guild_id ? Number((BigInt(cmd.guild_id) >> BigInt(22)) % BigInt(config.total_shards)) : 0)],
				["User", `${cmd.author.username}#${cmd.author.discriminator}`],
				["User ID", cmd.author.id],
				["Guild ID", cmd.guild_id || undef],
				["Text channel", cmd.channel_id],
				["Input", resource]
			]
			const maxLength = details.reduce((page, c) => Math.max(page, c[0].length), 0)
			const detailsString = details.map(row =>
				`\`${row[0]}${" ​".repeat(maxLength - row[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
			).join("\n")
			const embed: import("discord-typings").Embed = {
				title: "LavaLink loadtracks exception",
				color: 0xdd2d2d,
				fields: [
					{ name: "Details", value: detailsString },
					{ name: "Exception", value: e.message || undef }
				]
			}
			snow.channel.createMessage(reportTarget, { embeds: [embed] }).catch(() => void 0)
		})
		if (!tracks || !tracks.tracks.length) return null

		const decoded = tracks.tracks.map(t => encoding.decode(t.track))
		if (decoded.length === 1 || tracks.loadType === "TRACK_LOADED") return [decodedToTrack(tracks.tracks[0].track, decoded[0], resource, cmd.author, language.getLang(cmd.guild_locale!))]
		else if (tracks.loadType === "PLAYLIST_LOADED") return decoded.map((i, ind) => decodedToTrack(tracks.tracks[ind].track, i, resource, cmd.author, language.getLang(cmd.guild_locale!)))

		const chosen = await trackSelection(cmd, lang, decoded, i => `${i.author} - ${i.title} (${timeUtils.prettySeconds(Math.round(Number(i.length) / 1000))})`)
		if (!chosen) return null
		return [decodedToTrack(tracks.tracks[decoded.indexOf(chosen)].track, chosen, resource, cmd.author, language.getLang(cmd.guild_locale!))]
	},

	async loadtracks(input: string, nodeID?: string): Promise<import("lavalink-types").TrackLoadingResult> {
		const node = nodeID ? common.nodes.byID(nodeID) || common.nodes.byIdeal() || common.nodes.random() : common.nodes.byIdeal() || common.nodes.random()

		const params = new URLSearchParams()
		params.append("identifier", input)

		const data = await fetch(`http://${node.host}:${node.port}/loadtracks?${params.toString()}`, { headers: { Authorization: node.password } })
		const json: import("lavalink-types").TrackLoadingResult = await data.json()
		if (json.exception) throw new Error(json.exception.message)
		return json
	}
}

function trackSelection<T>(cmd: import("../../client/modules/Command"), lang: import("@amanda/lang").Lang, trackss: Array<T>, label: (item: T) => string): Promise<T | null> {
	const component = new BetterComponent({
		type: 3,
		placeholder: lang.GLOBAL.HEADER_SONG_SELECTION,
		min_values: 1,
		max_values: 1,
		options: trackss.map((s, index) => ({ label: label(s).slice(0, 98), value: String(index), description: `Track ${index + 1}`, default: false }))
	} as Omit<import("discord-typings").SelectMenu, "custom_id">)
	return new Promise(res => {
		const timer = setTimeout(() => {
			component.destroy()
			snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						color: constants.standard_embed_color,
						description: lang.GLOBAL.SONG_SELECTION_CANCELLED
					}
				],
				components: []
			}).catch(() => void 0)
			return res(null)
		}, selectTimeout)
		component.setCallback(async (interaction) => {
			await snow.interaction.createInteractionResponse(interaction.id, interaction.token, { type: 6 })
			if ((interaction.user ? interaction.user : interaction.member!.user).id != cmd.author.id) return
			component.destroy()
			clearTimeout(timer)
			const selected = trackss[Number(interaction.data!.values![0])]
			await snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						color: constants.standard_embed_color,
						description: label(selected)
					}
				],
				components: []
			}).catch(() => void 0)
			return res(selected)
		})

		snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			embeds: [
				{
					color: constants.standard_embed_color,
					description: language.replace(lang.GLOBAL.SONG_SELECTION_FOOTER, { "timeout": timeUtils.shortTime(selectTimeout, "ms") }),
					footer: { text: `1-${trackss.length}` }
				}
			],
			components: [
				{
					type: 1,
					components: [component.toComponent()]
				}
			]
		}).catch(() => void 0)
	})
}

function decodedToTrack(track: string, info: import("@lavalink/encoding").TrackInfo, input: string, requester: import("discord-typings").User, lang: import("@amanda/lang").Lang): import("./tracktypes").Track {
	const trackTypes = require("./tracktypes") as typeof import("./tracktypes")
	const type = sourceMap.get(info.source)
	return new (type ? trackTypes[type] : trackTypes["Track"])(track, info, input, requester, lang)
}

export = common
