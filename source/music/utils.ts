import cc = require("callback-components")
const encoding = require("@lavalink/encoding") as typeof import("@lavalink/encoding")
import { Rest } from "lavacord"

import passthrough = require("../passthrough")
const { constants, sync, config, lavalink, snow } = passthrough

const arr = sync.require("../client/utils/array") as typeof import("../client/utils/array")
const timeUtils = sync.require("../client/utils/time") as typeof import("../client/utils/time")
const language = sync.require("../client/utils/language") as typeof import("../client/utils/language")

const selectTimeout = 1000 * 60

const trackNameRegex = /([^|[\]]+?) ?(?:[-–—]|\bby\b) ?([^()[\],]+)?/ // (Toni Romiti) - (Switch Up )\(Ft. Big Rod\) | Non escaped () means cap group
const hiddenEmbedRegex = /(^<|>$)/g
const searchShortRegex = /^\w+?search:/
const startsWithHTTP = /^https?:\/\//

type Key = Exclude<keyof typeof import("./tracktypes"), "FriskyTrack" | "ListenMoeTrack" | "default">

const sourceMap = new Map<string, Key>([
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
			if (node) return common.nodes.byID(node.id)
			else return common.nodes.random()
		}
	},

	genius: {
		getLyrics(title: string, artist: string | undefined = undefined): Promise<string | null> {
			return fetch(`https://some-random-api.ml/lyrics?title=${encodeURIComponent(`${artist} - ${title}`)}`).then(d => d.json()).then(j => j.lyrics || j.error || null).catch(() => null)
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

	async inputToTrack(resource: string, cmd: import("../Command"), lang: import("@amanda/lang").Lang, node?: string): Promise<Array<import("./tracktypes").Track> | null> {
		resource = resource.replace(hiddenEmbedRegex, "")

		let tracks: Awaited<ReturnType<typeof common.loadtracks>> | undefined = undefined
		try {
			tracks = await common.loadtracks(resource, node)
		} catch (e) {
			const reportTarget = config.error_log_channel_id
			const undef = "undefined"
			const details = [
				["Tree", config.cluster_id],
				["Branch", "music"],
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
			const embed: import("discord-api-types/v10").APIEmbed = {
				title: "LavaLink loadtracks exception",
				color: 0xdd2d2d,
				fields: [
					{ name: "Details", value: detailsString },
					{ name: "Exception", value: e.message || undef }
				]
			}
			snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: e.message || "A load tracks exception occured, but no error message was provided", embeds: [] }).catch(() => void 0)
			snow.channel.createMessage(reportTarget, { embeds: [embed] }).catch(() => void 0)
			return null
		}

		if (!tracks || !tracks.tracks.length) {
			snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.NO_RESULTS, embeds: [] }).catch(() => void 0)
			return null
		}

		const decoded = tracks.tracks.map(t => encoding.decode(t.encoded))
		if (decoded.length === 1 || tracks.loadType === "TRACK_LOADED") return [decodedToTrack(tracks.tracks[0].encoded, decoded[0], resource, cmd.author, language.getLang(cmd.guild_locale!))]
		else if (tracks.loadType === "PLAYLIST_LOADED") return decoded.map((i, ind) => decodedToTrack(tracks!.tracks[ind].encoded, i, resource, cmd.author, language.getLang(cmd.guild_locale!)))

		const chosen = await trackSelection(cmd, lang, decoded, i => `${i.author} - ${i.title} (${timeUtils.prettySeconds(Math.round(Number(i.length) / 1000))})`)
		if (!chosen) {
			snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.NO_RESULTS, embeds: [] }).catch(() => void 0)
			return null
		}
		return [decodedToTrack(tracks.tracks[decoded.indexOf(chosen)].encoded, chosen, resource, cmd.author, language.getLang(cmd.guild_locale!))]
	},

	async loadtracks(input: string, nodeID?: string): Promise<import("lavalink-types").TrackLoadingResult> {
		const node = nodeID ? common.nodes.byID(nodeID) || common.nodes.byIdeal() || common.nodes.random() : common.nodes.byIdeal() || common.nodes.random()

		const llnode = lavalink.nodes.get(node.id)
		if (!llnode) throw new Error(`Lavalink node ${node.id} doesn't exist in lavacord`)

		if (!startsWithHTTP.test(input) && !searchShortRegex.test(input)) input = `${config.lavalink_default_search_short}${input}`

		const data = await Rest.load(llnode, input)
		if (data.exception) throw new Error(data.exception.message ?? "There was an exception somewhere")
		return data
	},

	// TypeScript complains about string.prototype.substr being deprecated and only being available for browser compatability
	// this polyfill has been tested to be compliant with the real substr with some of its quirks like not actually returning a length
	// of the specified length
	/**
	 * Gets a substring beginning at the specified location and having the specified length.
	 * @param text this string
	 * @param from The starting position of the desired substring. The index of the first character in the string is zero.
	 * @param length The number of characters to include in the returned substring.
	 */
	substr(text: string, from: number, length?: number) {
		if (length === 0) return ""
		if (!length || (from + length) <= text.length) return text.slice(from, length ? from + length : void 0)
		return text.repeat(Math.ceil(length / (from + text.length))).slice(from, from + length)
	}
}

function trackSelection<T>(cmd: import("../Command"), lang: import("@amanda/lang").Lang, trackss: Array<T>, label: (item: T) => string): Promise<T | null> {
	const component = new cc.BetterComponent({
		type: 3,
		placeholder: lang.GLOBAL.HEADER_SONG_SELECTION,
		min_values: 1,
		max_values: 1,
		options: trackss.map((s, index) => ({ label: label(s).slice(0, 98), value: String(index), description: `Track ${index + 1}`, default: false }))
	} as import("discord-api-types/v10").APISelectMenuComponent, { h: "trackSelect" })
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
			if (interaction.user?.id != cmd.author.id) return
			const select = interaction as import("discord-api-types/v10").APIMessageComponentSelectMenuInteraction
			component.destroy()
			clearTimeout(timer)
			const selected = trackss[Number(select.data.values[0])]
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
					components: [component.component]
				}
			]
		}).catch(() => void 0)
	})
}

function decodedToTrack(track: string, info: import("@lavalink/encoding").TrackInfo, input: string, requester: import("discord-api-types/v10").APIUser, lang: import("@amanda/lang").Lang): import("./tracktypes").Track {
	const trackTypes = require("./tracktypes") as Omit<typeof import("./tracktypes"), "RadioTrack">
	const type = sourceMap.get(info.source)
	const Track = (type ? trackTypes[type] : trackTypes["Track"])
	return new Track(track, info, input, requester, lang)
}

export = common
