import util = require("util")

import buttons = require("@amanda/buttons")
import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")
import redis = require("@amanda/redis")
import { type Lang, en_us } from "@amanda/lang"
import { Player, Rest } from "lavacord"

import type { ChatInputCommand } from "@amanda/commands"
import { type Track, type SecondVideo, type SecondPartialVideo, type SecondSearchResult, SecondTrack } from "./tracktypes"
import {
	type APIUser,
	type APIVoiceState,

	ComponentType,
	MessageFlags
} from "discord-api-types/v10"
import type { TrackLoadingResult, TrackInfo, Track as LLTrack } from "lavalink-types/v4"
import type { Queue } from "./queue"

import passthrough = require("../passthrough")
const { sync, confprovider, lavalink, snow, queues } = passthrough


const selectTimeout = 1000 * 60
const waitForClientVCJoinTimeout = 5000

const trackNameRegex = /(?:\w+ ? \| ?)?([^|[\]]+?) ?([-–—|:]|\bby\b) ?([^()[\],|]+)?/ // (Toni Romiti) - (Switch Up )\(Ft. Big Rod\) | Non escaped () means cap group
const knownGoodArtistRegex = /(.+?)(?:(?: - Topic)|(?:VEVO))/
const hiddenEmbedRegex = /(^<|>$)/g
const searchShortRegex = /^\w+?search:/
const startsWithHTTP = /^https?:\/\//
const replaceExtraneousRegex = / ?\([^)]+\) ?/g
const userTagRegex = /(.+?)#(\d+)$/

type Key = Exclude<keyof typeof import("./tracktypes"), "FriskyTrack" | "ListenMoeTrack" | "RadioTrack" | "default">

const sourceMap = new Map<string, Key>([
	["http", "ExternalTrack"]
])

class LoadTracksError extends Error {
	constructor(message: string, public readonly node: string, options?: ErrorOptions) {
		super(message, options)
	}
}

const common = {
	nodes: {
		random() {
			const filtered = confprovider.config.lavalink_nodes.filter(n => n.enabled)
			return sharedUtils.arrayRandom(filtered)
		},

		byID(id: string) {
			return confprovider.config.lavalink_nodes.find(n => n.id === id && n.enabled) ?? null
		},

		byIdeal() {
			const node = lavalink!.idealNodes[0]
			if (node) return common.nodes.byID(node.id)
			else return common.nodes.random()
		}
	},

	genius: {
		getLyrics(title: string, artist?: string | undefined): Promise<string | null> {
			return fetch(`https://some-random-api.com/lyrics?title=${encodeURIComponent(artist ? `${artist} - ${title}` : title)}`, {
				headers: {
					Authorization: confprovider.config.sra_token
				}
			})
			.then(d => d.json())
			.then(j => j.lyrics ?? j.error ?? null)
			.catch(() => null)
		},

		pickApart(track: Track) {
			let title = "", artist: string | undefined
			let confidence = 0
			let skip = false

			if (track.source === "spotify" || track.source === "applemusic" || track.source === "soundcloud") {
				confidence = 2
				title = track.title
				artist = track.author
				skip = true
			}

			if (!skip) {
				const authorNameMatch = knownGoodArtistRegex.exec(track.author)
				const trackNameMatch = trackNameRegex.exec(track.title)

				if (authorNameMatch) {
					title = track.title?.replace(new RegExp(`${authorNameMatch[1]} ?- ?`), "")?.replace(replaceExtraneousRegex, "")?.trim()
					artist = authorNameMatch[1]?.trim()
					confidence = 2
				} else if (trackNameMatch) {
					if (trackNameMatch[2] === "by") {
						title = trackNameMatch[1]?.trim()
						artist = trackNameMatch[3]?.trim()
					} else {
						title = trackNameMatch[3]?.trim()
						artist = trackNameMatch[1]?.trim()
					}
					confidence = 1 // mostly confident. Could just flip around
				}
			}

			if (!title || !artist) {
				title = track.title
				artist = track.author
			}

			return { title, artist, confidence }
		}
	},

	handleTrackLoadError(cmd: ChatInputCommand, error: LoadTracksError, input: string) {
		const reportTarget = confprovider.config.error_log_channel_id
		const undef = "undefined"

		const details = [
			["Tree", confprovider.config.cluster_id],
			["Branch", "music"],
			["Node", error.node],
			["User", sharedUtils.userString(cmd.author)],
			["User ID", cmd.author.id],
			["Guild ID", cmd.guild_id ?? undef],
			["Text Channel", cmd.channel.id],
			["Input", input]
		]

		const maxLength = details.reduce((page, c) => Math.max(page, c[0].length), 0)
		const detailsString = details.map(row =>
			`\`${row[0]}${" ​".repeat(maxLength - row[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
		).join("\n")

		snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			flags: MessageFlags.IsComponentsV2,
			components: [{ type: ComponentType.TextDisplay, content: error.message ?? "A load tracks exception occured, but no error message was provided" }]
		})

		snow.channel.createMessage(reportTarget, {
			flags: MessageFlags.IsComponentsV2,
			components: [
				{
					type: ComponentType.Container,
					accent_color: 0xdd2d2d,
					components: [
						{
							type: ComponentType.TextDisplay,
							content: "Lavalink load tracks exception"
						},
						{
							type: ComponentType.TextDisplay,
							content: detailsString,
						},
						{
							type: ComponentType.Separator
						},
						{
							type: ComponentType.TextDisplay,
							content: error.message ?? undef
						}
					]
				}
			]
		})
	},

	handleTrackLoadsToArray(tracks: TrackLoadingResult): Array<LLTrack> | null {
		switch (tracks.loadType) {
		case "empty":
		case "error":
			return null

		case "track":
			return [tracks.data]

		case "playlist":
			return tracks.data.tracks

		default:
			return tracks.data
		}
	},

	async inputToTrack(resource: string, cmd: ChatInputCommand, lang: Lang, node?: string | undefined, doSelection = true): Promise<Array<Track> | null> {
		resource = resource.replace(hiddenEmbedRegex, "")

		const llnode = (node ? common.nodes.byID(node) : void 0) ?? common.nodes.byIdeal() ?? common.nodes.random()

		const secondMatch = confprovider.config.second_matcher_regex.exec(resource)

		if (llnode.search_with_invidious && secondMatch) {
			let input = "", precedenceIndex = 0, precedence = -1
			while (input === "") {
				precedence = confprovider.config.second_matcher_group_precedence[precedenceIndex]
				if (secondMatch[precedence]) input = secondMatch[precedence]
				precedenceIndex++
				if (precedenceIndex === confprovider.config.second_matcher_group_precedence.length && input === "") return null
			}
			const mode: "search" | "id" = confprovider.config.second_matcher_map[precedence] ?? "search"
			let tracks: Array<SecondVideo | SecondPartialVideo>
			try {
				tracks = mode === "search"
					? await common.second.search(input, llnode.invidious_origin)
					: [await common.second.byID(input, llnode.invidious_origin)]
			} catch (e) {
				common.handleTrackLoadError(cmd, e, resource)
				return null
			}

			if (!tracks.length) {
				snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					flags: MessageFlags.IsComponentsV2,
					components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.NO_RESULTS }]
				})

				return null
			}

			if (mode !== "search" || doSelection === false) {
				return tracks.map(t => new SecondTrack("!", {
						identifier: t.videoId,
						isSeekable: t.lengthSeconds !== 0,
						author: t.author,
						length: t.lengthSeconds * 1000,
						isStream: t.lengthSeconds === 0,
						position: 0,
						title: t.title,
						artworkUrl: t.videoThumbnails.find(t2 => t2.quality === "maxresdefault")?.second__originalUrl ?? t.videoThumbnails[0].second__originalUrl,
						uri: confprovider.config.second_id_to_uri(t.videoId),
						sourceName: "http"
					},
					resource,
					cmd.author,
					sharedUtils.getLang(cmd.guild_locale!)
				))
			}

			const chosen = await trackSelection(
				cmd,
				lang,
				tracks,
				i => `${i.author} - ${i.title} (${sharedUtils.prettySeconds(i.lengthSeconds)})`
			)

			if (!chosen) {
				snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					flags: MessageFlags.IsComponentsV2,
					components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.NO_RESULTS }]
				})

				return null
			}

			return [
				new SecondTrack("!", {
						identifier: chosen.videoId,
						isSeekable: chosen.lengthSeconds !== 0,
						author: chosen.author,
						length: chosen.lengthSeconds * 1000,
						isStream: chosen.lengthSeconds === 0,
						position: 0,
						title: chosen.title,
						artworkUrl: chosen.videoThumbnails.find(t2 => t2.quality === "maxresdefault")?.second__originalUrl ?? chosen.videoThumbnails[0].second__originalUrl,
						uri: confprovider.config.second_id_to_uri(chosen.videoId),
						sourceName: "http"
					},
					resource,
					cmd.author,
					sharedUtils.getLang(cmd.guild_locale!)
				)
			]
		} else {
			let tracks: Awaited<ReturnType<typeof common.loadtracks>> | undefined
			try {
				tracks = await common.loadtracks(resource, lang, llnode.id)
			} catch (e) {
				common.handleTrackLoadError(cmd, e, resource)
				return null
			}

			const mapped = common.handleTrackLoadsToArray(tracks)

			if (!mapped) {
				snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					flags: MessageFlags.IsComponentsV2,
					components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.NO_RESULTS }]
				})

				return null
			}

			if (tracks.loadType !== "search" || doSelection === false) {
				return mapped.map(track => decodedToTrack(
					track.encoded,
					track.info,
					resource,
					cmd.author,
					sharedUtils.getLang(cmd.guild_locale!)
				))
			}

			const chosen = await trackSelection(
				cmd,
				lang,
				tracks.data,
				i => `${i.info.author} - ${i.info.title} (${sharedUtils.prettySeconds(Math.round(Number(i.info.length) / 1000))})`
			)

			if (!chosen) {
				snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					flags: MessageFlags.IsComponentsV2,
					components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.NO_RESULTS }]
				})

				return null
			}

			return [
				decodedToTrack(
					chosen.encoded,
					chosen.info,
					resource,
					cmd.author,
					sharedUtils.getLang(cmd.guild_locale!)
				)
			]
		}
	},

	async loadtracks(input: string, lang: Lang, nodeID?: string | undefined): Promise<TrackLoadingResult> {
		const node = (nodeID ? common.nodes.byID(nodeID) : void 0) ?? common.nodes.byIdeal() ?? common.nodes.random()

		const llnode = lavalink.nodes.get(node.id)
		if (!llnode) throw new LoadTracksError(`Lavalink node ${node.id} doesn't exist in lavacord`, node.id)

		if (!startsWithHTTP.test(input) && !searchShortRegex.test(input)) input = `${confprovider.config.lavalink_default_search_prefix}${input}`

		const data = await Rest.load(llnode, input)
		if (data.loadType === "error") throw new LoadTracksError(data.data.message ?? lang.GLOBAL.UNKNOWN_TRACK_EXCEPTION, node.id)

		return data
	},

	second: {
		async search(input: string, baseURL: string): Promise<SecondSearchResult> {
			const r = await fetch(`${baseURL}/api/v1/search?q=${encodeURIComponent(input)}`)
			return r.json()
		},
		async byID(id: string, baseURL: string): Promise<SecondVideo> {
			const r = await fetch(`${baseURL}/api/v1/videos/${id}`)
			if ("error" in r) throw new Error(r.error as string)
			return r.json()
		}
	},

	queues: {
		async createQueue(cmd: ChatInputCommand, lang: Lang, state: APIVoiceState, node: string, followup = false): Promise<Queue | null> {
			const respond = (followup ? snow.interaction.createFollowupMessage : snow.interaction.editOriginalInteractionResponse).bind(snow.interaction)
			if (cmd.guild_id! !== state.guild_id!) {
				respond(cmd.application_id, cmd.token, {
					flags: MessageFlags.IsComponentsV2,
					components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.VC_IN_OTHER_GUILD }]
				})
				return null
			}

			const queueFile: typeof import("./queue") = sync.require("./queue")

			const queue = new queueFile.Queue(cmd.guild_id!, state.channel_id!, cmd.channel.id)

			queue.lang = cmd.guild_locale ? sharedUtils.getLang(cmd.guild_locale) : lang
			queue.interaction = cmd

			snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				flags: MessageFlags.IsComponentsV2,
				components: [
					{
						type: ComponentType.Container,
						components: [
							{
								type: ComponentType.TextDisplay,
								content: langReplace(lang.GLOBAL.NOW_PLAYING, {
									"song": `[**${lang.GLOBAL.HEADER_LOADING}**](${confprovider.config.website_protocol}://${confprovider.config.website_domain})\n\n\`[${sharedUtils.progressBar(18, 60, 60, `[${lang.GLOBAL.HEADER_LOADING}]`)}]\``
								})
							}
						]
					}
				]
			})

			try {
				const player = await lavalink.join({ channel: state.channel_id!, guild: cmd.guild_id!, node })
				// wait to create timer so that we know for a fact the message was sent

				await new Promise<void>((res, rej) => {
					const timer = setTimeout(() => {
						queue.createResolveCallback = void 0
						rej(lang.GLOBAL.TIMED_OUT)
					}, waitForClientVCJoinTimeout)

					queue.createResolveCallback = () => {
						clearTimeout(timer)
						res()
					}
				})

				queue.node = node
				queue.player = player
				queue.addPlayerListeners()
				return queue
			} catch (e) {
				if (e !== lang.GLOBAL.TIMED_OUT) console.error(e)
				queue.destroy()

				respond(cmd.application_id, cmd.token, {
					flags: MessageFlags.IsComponentsV2,
					components: [{ type: ComponentType.TextDisplay, content: `${langReplace(lang.GLOBAL.VC_NOT_JOINABLE, { username: cmd.author.username })}\n${await sharedUtils.stringify(e)}` }]
				})
				snow.channel.createMessage(confprovider.config.error_log_channel_id, {
					content: `Unable to join voice channel ${state.channel_id} in guild ${cmd.guild_id}\n\n${util.inspect(e, false, 3, false)}`
				})
				return null
			}
		},

		async createQueueFromRestore(guildID: string, data: ReturnType<Queue["toJSON"]>): Promise<void> {
			const node = data.node ? lavalink.nodes.get(data.node) : void 0
			if (!node) return void console.error(`Node ${data.node} doesn't exist in memory`)
			const queueFile: typeof import("./queue") = sync.require("./queue")

			const queue = new queueFile.Queue(guildID, data.voiceChannel.id, data.textChannelID)

			queue.lang = en_us
			queue.node = data.node
			queue.player = new Player(node, guildID)

			queue.loop = data.attributes.loop

			for (const member of data.members) {
				const tag = userTagRegex.exec(member.tag)
				queue.listeners.set(member.id, {
					id: member.id,
					username: tag ? tag[1] : member.tag,
					discriminator: tag ? tag[2] : "0",
					global_name: "",
					avatar: member.avatar
				})
			}

			queue.pausedAt = data.pausedAt
			if (data.pausedAt) queue.player.paused = true
			queue.trackStartTime = data.trackStartTime

			const trackTypes: typeof import("./tracktypes") = sync.require("./tracktypes")
			for (const track of data.tracks) {
				const ctrack = new (trackTypes[track.class] as typeof Track)(
					track.track,
					{
						identifier: track.id,
						isSeekable: track.seekable,
						author: track.author,
						length: track.length * 1000,
						isStream: track.live,
						position: 0,
						title: track.title,
						uri: track.uri,
						isrc: track.isrc,
						sourceName: track.source
					},
					track.input,
					{
						id: confprovider.config.client_id,
						username: "amanda_restore_internal",
						discriminator: "0",
						global_name: "Amanda Restore Internal",
						avatar: null
					},
					queue.lang
				)
				ctrack.complete = track.complete
				await queue.addTrack(ctrack)
			}

			queue.addPlayerListeners()
			console.warn(`Restored queue ${guildID}`)
		},

		async getOrCreateQueue(cmd: ChatInputCommand, lang: Lang, followup = false): Promise<{
			queue: import("./queue").Queue | null;
			existed: boolean
		}> {
			let queue = queues.get(cmd.guild_id!) ?? null

			const userVoiceState = await redis.GET<APIVoiceState>("voice", cmd.author.id)
			const respond = (followup ? snow.interaction.createFollowupMessage : snow.interaction.editOriginalInteractionResponse).bind(snow.interaction)

			if (!userVoiceState) {
				respond(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username })
				})
				return { queue: null, existed: !!queue }
			}

			if (queue?.voiceChannelID && userVoiceState.channel_id !== queue.voiceChannelID) {
				respond(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` })
				})
				return { queue: null, existed: true }
			}

			if (queue) return { queue, existed: true }
			const node = common.nodes.byIdeal() ?? common.nodes.random()

			queue = await common.queues.createQueue(cmd, lang, userVoiceState, node.id, followup).catch(() => null)
			if (!queue) return { queue: null, existed: false }

			return { queue, existed: false }
		},

		doChecks(cmd: ChatInputCommand, lang: Lang, isAddTrack = false): boolean {
			if (!confprovider.config.redis_enabled) {
				snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.DATABASE_OFFLINE })
				return false
			}

			if (!confprovider.config.music_enabled && isAddTrack) {
				snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.MUSIC_DISABLED })
				return false
			}

			if (!cmd.guild_id) {
				snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.GUILD_ONLY })
				return false
			}

			return true
		},

		getQueueWithRequiredPresence(cmd: ChatInputCommand, lang: Lang): Queue | null {
			const queue = queues.get(cmd.guild_id!)

			if (!queue) {
				snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username })
				})

				return null
			}

			if (!queue.listeners.has(cmd.author.id)) {
				snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` })
				})

				return null
			}

			return queue
		}
	}
}

function trackSelection<T>(cmd: ChatInputCommand, lang: import("@amanda/lang").Lang, trackss: Array<T>, label: (item: T) => string): Promise<T | null> {
	if (trackss.length === 0) return Promise.resolve(null)
	const component = new buttons.BetterComponent({
		type: 3,
		placeholder: lang.GLOBAL.HEADER_SONG_SELECTION,
		min_values: 1,
		max_values: 1,
		options: trackss.slice(0, 24).map((s, index) => ({ label: label(s).slice(0, 98), value: String(index), description: `Track ${index + 1}`, default: false }))
	} as import("discord-api-types/v10").APISelectMenuComponent, {})

	return new Promise(res => {
		const timer = new sharedUtils.BetterTimeout(() => {
			component.destroy()

			snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				flags: MessageFlags.IsComponentsV2,
				components: [
					{
						type: ComponentType.Container,
						components: [
							{
								type: ComponentType.TextDisplay,
								content: lang.GLOBAL.SONG_SELECTION_CANCELLED
							}
						]
					}
				]
			})

			return res(null)
		}, selectTimeout).run()

		component.setCallback(async (interaction) => {
			if ((interaction.member?.user ?? interaction.user!).id != cmd.author.id) return

			const select = interaction as import("discord-api-types/v10").APIMessageComponentSelectMenuInteraction
			component.destroy()
			timer.clear()

			const selected = trackss[Number(select.data.values[0])]

			await snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				flags: MessageFlags.IsComponentsV2,
				components: [{
					type: ComponentType.Container,
					components: [
						{
							type: ComponentType.TextDisplay,
							content: label(selected)
						}
					]
				}]
			})
			return res(selected)
		})

		snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			flags: MessageFlags.IsComponentsV2,
			components: [
				{
					type: ComponentType.Container,
					components: [
						{
							type: ComponentType.TextDisplay,
							content: langReplace(lang.GLOBAL.SONG_SELECTION_FOOTER, { "timeout": sharedUtils.shortTime(selectTimeout) })
						},
						{
							type: ComponentType.ActionRow,
							components: [component.component]
						},
						{
							type: ComponentType.Separator
						},
						{
							type: ComponentType.TextDisplay,
							content: `1-${trackss.length}`
						}
					]
				}
			]
		})
	})
}

function decodedToTrack(track: string, info: TrackInfo, input: string, requester: APIUser, lang: Lang): Track {
	const trackTypes = require("./tracktypes") as Omit<typeof import("./tracktypes"), "RadioTrack">
	const type = sourceMap.get(info.sourceName)
	const TrackConstructor: typeof trackTypes["Track"] = (type ? trackTypes[type] : trackTypes["Track"])
	return new TrackConstructor(track, info, input, requester, lang)
}

export = common
