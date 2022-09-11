import { BetterComponent } from "callback-components"
import entities from "entities"

import passthrough from "../../passthrough"
const { constants, sync, client, twitter } = passthrough

const arr = sync.require("../../utils/array") as typeof import("../../utils/array")
const logger = sync.require("../../utils/logger") as typeof import("../../utils/logger")
const timeUtils = sync.require("../../utils/time") as typeof import("../../utils/time")

const fakeHTTPAgent = `Mozilla/5.0 (Server; NodeJS ${process.version}; rv:1.0) Neko/1.0 (KHTML, like Gecko) Amanda/1.0`
const selectTimeout = 1000 * 60

type inputToIDReturnValue = { type: "soundcloud" | "spotify" | "newgrounds" | "youtube" | "playlist" | "twitter" | "itunes" | "external"; link?: string | null, id?: string | null; search?: true; list?: string | null; }

const youtubeTrackNameRegex = /([^|[\]]+?) ?(?:[-–—]|\bby\b) ?([^()[\],]+)?/ // (Toni Romiti) - (Switch Up )\(Ft. Big Rod\) | Non escaped () means cap group
const youtubeTopicTrackNameRegex = /([^-]+) - Topic/ // If the artist is officially uploaded by YouTube. Sucks to suck if they have a - in their name
const newgroundsIDRegex = /https:\/\/(?:www\.)?newgrounds\.com\/audio\/listen\/([\d\w]+)/
const twitterCoRegex = /https:\/\/t.co\/[\w\d]+/
const itunesAlbumRegex = /\/album\/([^/]+)\//
const hiddenEmbedRegex = /(^<|>$)/g
const sourceSelectorRegex = /^\w{2}:/
const youtubeVideoIDRegex = /video\/([\w-]{11})$/
const twitterStatusRegex = /\/[\w\d]+\/status\/\d+/
const youtubeIDRegex = /^[A-Za-z0-9_-]{11}$/

const common = {
	nodes: {
		random() {
			const filtered = constants.lavalinkNodes.filter(n => n.enabled)
			return arr.random(filtered)
		},

		byID(id: string) {
			return constants.lavalinkNodes.find(n => n.id === id && n.enabled) || null
		},

		byRegion(region: string) {
			const satisfied = constants.lavalinkNodes.filter(n => n.enabled && n.regions.includes(region))
			if (satisfied.length === 0) return null
			return arr.random(satisfied)
		}
	},

	genius: {
		getLyrics(title: string, artist: string | undefined = undefined): Promise<string | null> {
			return fetch(`https://some-random-api.ml/lyrics?title=${encodeURIComponent(`${artist} - ${title}`)}`).then(d => d.json()).then(j => j.lyrics || j.error || null)
		},

		pickApart(song: import("./songtypes").Song) {
			const songTypes = require("./songtypes") as typeof import("./songtypes")

			let title = "", artist: string | undefined

			const standard = () => {
				const match = song.title.match(youtubeTrackNameRegex)
				if (match) {
					title = match[2]
					artist = match[1]
				}
				if (!title || !artist) {
					if (song instanceof songTypes.YouTubeSong) {
						title = song.title
						artist = song.uploader
					}
				}
			}

			if (/* song instanceof songTypes.SpotifySong || */song instanceof songTypes.SoundCloudSong) {
				title = song.title
				artist = song.artist
			} else if (song instanceof songTypes.YouTubeSong) {
				if (song.uploader) {
					const topic = song.uploader.match(youtubeTopicTrackNameRegex)
					if (topic) {
						title = song.title
						artist = topic[1]
					} else standard()
				} else standard()
			} else standard()

			return { title, artist }
		}
	},

	newgrounds: {
		async search(text: string) {
			let html: string
			try {
				html = await fetch(`https://www.newgrounds.com/search/conduct/audio?suitables=etm&c=3&terms=${encodeURIComponent(text)}`).then(res => res.text())
			} catch(e) {
				logger.error(e)
				throw e
			}
			const ss = "<ul class=\"itemlist spaced\">"
			const start = html.indexOf(ss)
			const afterStart = html.substring(start)
			const end = afterStart.indexOf("</ul>")
			let results = afterStart.slice(ss.length, end).trim()

			const parsed = [] as Array<{ href: string; image: string; title: string; author: string; }>

			let passing = true
			while (passing) {
				if (!results.includes("<li>")) {
					passing = false
					continue
				}
				const li = results.slice(0, results.indexOf("</li>"))

				// Get the link to the list entry
				const hrefStart = li.indexOf("<a href=")
				const hrefAfter = li.substring("<a href=".length + 1 + hrefStart)
				const hrefEnd = hrefAfter.indexOf("\"")
				const href = hrefAfter.slice(0, hrefEnd)

				// Get the icon of the list entry
				const imgStart = li.indexOf("<img src=")
				const imgAfter = li.substring("<img src=".length + 1 + imgStart)
				const imgEnd = imgAfter.indexOf("\"")
				const image = imgAfter.slice(0, imgEnd)

				// Get the title of the list entry
				const titleStart = li.indexOf("<h4>")
				const titleAfter = li.substring("<h4>".length + titleStart)
				const titleEnd = titleAfter.indexOf("</h4>")
				const title = titleAfter.slice(0, titleEnd)
					.replace(/<mark class="search-highlight">/g, "")
					.replace(/<\/mark>/g, "")
					.trim()

				// Get the author of the list entry
				const authorStart = li.indexOf("<strong>")
				const authorAfter = li.substring("<strong>".length + authorStart)
				const authorEnd = authorAfter.indexOf("</strong>")
				const author = authorAfter.slice(0, authorEnd)

				const meta = { href: href, image: image, title: entities.decodeHTML(title), author: author }

				parsed.push(meta)

				results = results.substring(li.length + 5).trim()
			}

			return parsed
		},

		async getData(url: string) {
			const ID = url.match(newgroundsIDRegex)![1]
			let data: { id: number; url: string; title: string; author: string; duration: number; sources: Array<{ src: string }>; }
			try {
				data = await fetch(`https://www.newgrounds.com/audio/load/${ID}/3`, { headers: { "X-Requested-With": "XMLHttpRequest" } }).then(d => d.json())
			} catch {
				throw new Error("Cannot extract NewGrounds track info")
			}
			return { id: data.id, href: data.url, title: data.title, author: data.author, duration: data.duration, mp3URL: data.sources[0].src }
		}
	},

	twitter: {
		async getData(url: string): Promise<{ title: string; url: string; }> {
			const data = await twitter.getTweetMeta(url)
			if (!data.isVideo || !data.media_url) throw new Error("That twitter URL doesn't have a video")
			const mp4 = data.media_url.find(i => i.content_type === "video/mp4")
			if (!mp4) throw new Error("No mp4 URLs from link")
			return { title: data.description?.replace(twitterCoRegex, "").trim() || "No tweet description", url: mp4.url }
		}
	},

	itunes: {
		async getData(url: string): Promise<Array<import("../../types").iTunesSearchResult>> {
			const match = url.match(itunesAlbumRegex)
			if (!match) throw new Error("Link not an album URL")
			const decoded = new URL(url)
			let mode = "track" as "track" | "album"
			if (!decoded.searchParams.has("i")) mode = "album"
			let data
			try {
				data = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(match[1])}&country=US&entity=song`).then(d => d.json())
			} catch {
				throw new Error("Cannot get iTunes data")
			}
			let a: Array<import("../../types").iTunesSearchResult>
			if (mode === "track") a = [data.results[0]]
			else a = data.results.filter((value, index, self) => self.indexOf(self.find(i => i.trackName === value.trackName)) === index)
			return a
		}
	},

	inputToID(input: string): inputToIDReturnValue {
		input = input.replace(hiddenEmbedRegex, "")
		if (input.match(sourceSelectorRegex)) {
			if (input.startsWith("yt")) return { type: "youtube", id: input.substring(3), search: true }
			else if (input.startsWith("sc")) return { type: "soundcloud", id: input.substring(3), search: true }
			else if (input.startsWith("ng")) return { type: "newgrounds", id: input.substring(3), search: true }
		} else if (!input.startsWith("http") && !input.includes(".com/")) return { type: "youtube", id: input, search: true }

		try {
			let inputAsURL = input
			if (inputAsURL.includes(".com/") && !inputAsURL.startsWith("http")) inputAsURL = `https://${inputAsURL}`
			const url = new URL(inputAsURL)
			// It's a URL.
			if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4)
			// Is it SoundCloud?
			if (url.hostname === "soundcloud.com") {
				// Bam, done.
				return { type: "soundcloud", link: url.toString() }
			} else if (url.hostname == "open.spotify.com" && (url.pathname.startsWith("/playlist") || url.pathname.startsWith("/track") || url.pathname.startsWith("/album"))) {
				return { type: "spotify", link: url.toString() }
			} else if (url.hostname == "newgrounds.com" && url.pathname.startsWith("/audio/listen")) {
				return { type: "newgrounds", link: url.toString() }
			} else if (url.hostname == "cadence.moe" || url.hostname == "cadence.gq") { // Is it CloudTube?
				try {
					// @ts-expect-error There is a catch block for if it doesn't match the regex
					const id = url.pathname.match(youtubeVideoIDRegex)[1]
					// Got an ID!
					return { type: "youtube", id: id }
				} catch (e) {
					// Didn't match.
					return { type: "youtube", id: input, search: true }
				}
			} else if (url.hostname == "youtu.be") { // Is it youtu.be?
				const id = url.pathname.slice(1)
				return { type: "youtube", id: id }
			} else if (url.hostname == "youtube.com" || url.hostname == "invidio.us" || url.hostname == "hooktube.com" || url.hostname === "m.youtube.com") { // Is it YouTube-compatible?
				// Is it a playlist?
				if (url.searchParams.get("list")) {
					const result = { type: "playlist", list: url.searchParams.get("list") } as { type: "playlist"; list: string | null, id?: string }
					const id = url.searchParams.get("v")
					if (id) result.id = id
					return result
				} else if (url.pathname == "/watch") { // Is it a video?
					const id = url.searchParams.get("v")
					// Got an ID!
					return { type: "youtube", id: id }
				} else return { type: "youtube", id: input, search: true } // YouTube-compatible, but can't resolve to a video.
			} else if (url.hostname == "twitter.com" && url.pathname.match(twitterStatusRegex)) {
				return { type: "twitter", link: url.toString() }
			} else if (url.hostname === "music.apple.com" && url.pathname.match(itunesAlbumRegex)) {
				return { type: "itunes", link: url.toString() }
			} else return { type: "external", link: url.toString() } // Possibly a link to an audio file
		} catch (e) {
			// Not a URL. Might be an ID?
			if (input.match(youtubeIDRegex)) return { type: "youtube", id: input }
			else return { type: "youtube", id: input, search: true }
		}
	},

	async idToSong(info: inputToIDReturnValue, cmd: import("discord-typings").Interaction, lang: import("@amanda/lang").Lang, node?: string): Promise<Array<import("./songtypes").Song> | null> {
		const songTypes = require("./songtypes") as typeof import("./songtypes")
		if (info.search) {
			if (info.type === "youtube" || info.type === "soundcloud") {
				const data = await common.loadtracks(`${info.type === "youtube" ? "yt" : "sc"}search:${info.id}`, node).catch(() => void 0)
				if (!data || data.length === 0) return null
				const songs = (info.type === "youtube" ?
					data.map(cur => new songTypes.YouTubeSong(cur.info.identifier, cur.info.title, Math.round(cur.info.length / 1000), cur.track, cur.info.author)) :
					data.map(cur => new songTypes.SoundCloudSong(cur.info, cur.track))) as Array<import("./songtypes").YouTubeSong | import("./songtypes").SoundCloudSong>
				if (songs.length === 0) return null
				if (songs.length === 1) return songs
				const selection = await songSelection(songs, (s) => `${s.title} - ${timeUtils.prettySeconds(s.lengthSeconds)}`)
				if (!selection) return null
				return [selection]
			} else {
				// The only other search option is newgrounds
				const data = await common.newgrounds.search(info.id!).catch(() => void 0)
				if (!data || data.length === 0) return null
				const selected = await songSelection(data, (s) => `${s.author} - ${s.title}`)
				if (!selected) return null
				const fetched = await common.newgrounds.getData(selected.href).catch(() => void 0)
				if (!fetched) return null
				return [new songTypes.NewgroundsSong(fetched)]
			}
		} else {
			// searching by urls. Do incompatible searching with LavaLink first
			if (info.type === "newgrounds") {
				const data = await common.newgrounds.getData(info.link!).catch(() => void 0)
				if (!data) return null
				return [new songTypes.NewgroundsSong(data)]
			} else if (info.type === "itunes") {
				const data = await common.itunes.getData(info.link!).catch(() => void 0)
				if (!data || data.length === 0) return null
				return [new songTypes.iTunesSong(data[0])]
			} else if (info.type === "twitter") {
				const data = await common.twitter.getData(info.link!).catch(() => void 0)
				if (!data) return null
				return [new songTypes.TwitterSong(Object.assign(data, { uri: data.url, displayURI: info.link! }))]
			} else if (info.type === "spotify") {
				const data = await common.loadtracks(info.link!, node).catch(() => void 0)
				if (!data) return null
				if (data.length) return data.map(i => new songTypes.SpotifySong({ url: i.info.uri, name: i.info.title, artist: i.info.author, duration: Math.round(i.info.length / 1000) }))
				return null
			} else {
				if (info.type === "external") return [new songTypes.ExternalSong(info.link!)]
				if (info.type == "playlist" && !info.id) {
					if (!info.list) return null
					const d = await common.loadtracks(info.list, node)
					if (!d || d.length === 0) return null
					return d.map(s => new songTypes.YouTubeSong(s.info.identifier, s.info.title, Math.round(s.info.length / 1000), s.track, s.info.author))
				}
				const data = await common.loadtracks(info.link || info.id!, node).catch(() => void 0)
				if (!data || data.length === 0) return null
				const selected = data[0]
				return [(info.type === "youtube" ?
					new songTypes.YouTubeSong(selected.info.identifier, selected.info.title, Math.round(selected.info.length / 1000), selected.track, selected.info.author) :
					new songTypes.SoundCloudSong(selected.info, selected.track))]
			}
		}

		function songSelection<T>(songs: Array<T>, label: (item: T) => string): Promise<T | null> {
			const component = new BetterComponent({
				type: 3,
				placeholder: lang.GLOBAL.HEADER_SONG_SELECTION,
				min_values: 1,
				max_values: 1,
				options: songs.map((s, index) => ({ label: label(s).slice(0, 98), value: String(index), description: `Song ${index + 1}`, default: false }))
			} as Omit<import("discord-typings").SelectMenu, "custom_id">)
			return new Promise(res => {
				const timer = setTimeout(() => {
					component.destroy()
					client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						embeds: [
							{
								color: constants.standard_embed_color,
								description: "Cancelled on Twitter"
							}
						],
						components: []
					}).catch(() => void 0)
					return res(null)
				}, selectTimeout)
				component.setCallback(async (interaction) => {
					await client.snow.interaction.createInteractionResponse(interaction.id, interaction.token, { type: 6 })
					if ((interaction.user ? interaction.user : interaction.member!.user).id != (cmd.user ? cmd.user : cmd.member!.user).id) return
					component.destroy()
					clearTimeout(timer)
					const selected = songs[Number(interaction.data!.values![0])]
					await client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
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

				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							color: constants.standard_embed_color,
							description: `Choose one of the options below in the select menu to play. Expires after ${timeUtils.shortTime(selectTimeout, "ms")}`,
							footer: { text: `1-${songs.length}` }
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
	},

	async loadtracks(input: string, nodeID?: string): Promise<Array<{ track: string; info: import("../../types").LavalinkInfo }>> {
		const node = nodeID ? common.nodes.byID(nodeID) || common.nodes.random() : common.nodes.random()

		const params = new URLSearchParams()
		params.append("identifier", input)

		const data = await fetch(`http://${node.host}:${node.port}/loadtracks?${params.toString()}`, { headers: { Authorization: node.password } })
		const json = await data.json()
		if (json.exception) throw json.exception.message
		return json.tracks
	}
}

export = common
