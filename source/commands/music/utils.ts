import genius from "genius-lyrics-api"
import c from "centra"
import entities from "entities"
import vul from "video-url-link"

import passthrough from "../../passthrough"
const { constants, config, sync } = passthrough

const arr = sync.require("../../utils/array") as typeof import("../../utils/array")
const logger = sync.require("../../utils/logger") as typeof import("../../utils/logger")

const fakeHTTPAgent = `Mozilla/5.0 (Server; NodeJS ${process.version}; rv:1.0) Neko/1.0 (KHTML, like Gecko) Amanda/1.0`

type inputToIDReturnValue = { type: "soundcloud" | "spotify" | "newgrounds" | "youtube" | "playlist" | "twitter" | "itunes" | "external"; link?: string | null, id?: string | null; search?: true }

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
			const options = {
				apiKey: config.genius_access_token,
				title: title,
				artist: artist,
				optimizeQuery: true
			}
			return genius.getLyrics(options)
		},

		pickApart(song: import("./songtypes").Song) {
			const songTypes = require("./songtypes") as typeof import("./songtypes")

			const expressions = [
				/([^|[\]]+?) ?(?:[-–—]|\bby\b) ?([^()[\],]+)?/, // (Toni Romiti) - (Switch Up )\(Ft. Big Rod\) | Non escaped () means cap group
				/([^-]+) - Topic/ // If the artist is officially uploaded by YouTube. Sucks to suck if they have a - in their name
			]

			let title = "", artist: string | undefined

			const standard = () => {
				const match = song.title.match(expressions[0])
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
					const topic = song.uploader.match(expressions[1])
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
				html = await c(`https://www.newgrounds.com/search/conduct/audio?suitables=etm&c=3&terms=${encodeURIComponent(text)}`).send().then(res => res.text())
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
			const ID = url.match(/https:\/\/(?:www\.)?newgrounds\.com\/audio\/listen\/([\d\w]+)/)![1]
			let data: { id: number; url: string; title: string; author: string; duration: number; sources: Array<{ src: string }>; }
			try {
				data = await c(`https://www.newgrounds.com/audio/load/${ID}/3`, "get").header("x-requested-with", "XMLHttpRequest").send().then(d => d.json())
			} catch {
				throw new Error("Cannot extract NewGrounds track info")
			}
			return { id: data.id, href: data.url, title: data.title, author: data.author, duration: data.duration, mp3URL: data.sources[0].src }
		}
	},

	twitter: {
		getData(url: string): Promise<{ title: string; url: string; }> {
			return new Promise((res, rej) => {
				vul.twitter.getInfo(url, {}, (err, info) => {
					if (err) return rej(new Error("That twitter URL doesn't have a video"))
					/** @type {Array<{ bitrate: number, content_type: string, url: string }>} */
					const mp4s = info.variants.filter(v => v.content_type === "video/mp4")
					if (!mp4s.length) return rej(new Error("No mp4 URLs from link"))
					const highest = mp4s.sort((a, b) => b.bitrate - a.bitrate)[0]
					res({ title: info.full_text.replace(/https:\/\/t.co\/[\w\d]+/, "").trim(), url: highest.url })
				})
			})
		}
	},

	itunes: {
		async getData(url: string): Promise<Array<import("../../types").iTunesSearchResult>> {
			const match = url.match(/\/album\/([^/]+)\//)
			if (!match) throw new Error("Link not an album URL")
			const decoded = new URL(url)
			let mode = "track" as "track" | "album"
			if (!decoded.searchParams.has("i")) mode = "album"
			let data
			try {
				data = await c("https://itunes.apple.com/search", "get")
					.header({ Accept: "application/json", "User-Agent": fakeHTTPAgent })
					.query("term", encodeURIComponent(match[1]))
					.query("country", "US")
					.query("entity", "song")
					.send()
					.then(d => d.json())
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
		input = input.replace(/(^<|>$)/g, "")
		if (input.match(/^\w{2}:/)) {
			if (input.startsWith("yt")) return { type: "youtube", id: input, search: true }
			else if (input.startsWith("sc")) return { type: "soundcloud", id: input, search: true }
			else if (input.startsWith("ng")) return { type: "newgrounds", id: input, search: true }
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
					const id = url.pathname.match(/video\/([\w-]{11})$/)[1]
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
			} else if (url.hostname == "twitter.com" && url.pathname.match(/\/[\w\d]+\/status\/\d+/)) {
				return { type: "twitter", link: url.toString() }
			} else if (url.hostname === "music.apple.com" && url.pathname.match(/\/album\/[^/]+\//)) {
				return { type: "itunes", link: url.toString() }
			} else return { type: "external", link: url.toString() } // Possibly a link to an audio file
		} catch (e) {
			// Not a URL. Might be an ID?
			if (input.match(/^[A-Za-z0-9_-]{11}$/)) return { type: "youtube", id: input }
			else return { type: "youtube", id: input, search: true }
		}
	},

	async idToSong(info: inputToIDReturnValue, node?: string): Promise<import("./songtypes").Song | null> {
		const songTypes = require("./songtypes") as typeof import("./songtypes")
		if (info.search) {
			if (info.type === "youtube" || info.type === "soundcloud") {
				const data = await common.loadtracks(`${info.type === "youtube" ? "yt" : "sc"}search:${info.id}`, node).catch(() => void 0)
				if (!data || data.length === 0) return null
				const selected = data[0]
				return (info.type === "youtube" ?
					new songTypes.YouTubeSong(selected.info.identifier, selected.info.title, Math.round(selected.info.length / 1000), selected.track, selected.info.author) :
					new songTypes.SoundCloudSong(selected.info, selected.track))
			} else {
				// The only other search option is newgrounds
				const data = await common.newgrounds.search(info.id!).catch(() => void 0)
				if (!data || data.length === 0) return null
				const fetched = await common.newgrounds.getData(data[0].href).catch(() => void 0)
				if (!fetched) return null
				return new songTypes.NewgroundsSong(fetched)
			}
		} else {
			// searching by urls. Do incompatible searching with LavaLink first
			if (info.type === "newgrounds") {
				const data = await common.newgrounds.getData(info.link!).catch(() => void 0)
				if (!data) return null
				return new songTypes.NewgroundsSong(data)
			} else if (info.type === "itunes") {
				const data = await common.itunes.getData(info.link!).catch(() => void 0)
				if (!data || data.length === 0) return null
				return new songTypes.iTunesSong(data[0])
			} else if (info.type === "twitter") {
				const data = await common.twitter.getData(info.link!).catch(() => void 0)
				if (!data) return null
				return new songTypes.TwitterSong(Object.assign(data, { uri: data.url, displayURI: info.link! }))
			} else if (info.type === "spotify") return null
			else {
				if (info.type === "external") return new songTypes.ExternalSong(info.link!)
				if (info.type == "playlist") return null
				const data = await common.loadtracks(info.link || info.id!, node).catch(() => void 0)
				if (!data || data.length === 0) return null
				const selected = data[0]
				return (info.type === "youtube" ?
					new songTypes.YouTubeSong(selected.info.identifier, selected.info.title, Math.round(selected.info.length / 1000), selected.track, selected.info.author) :
					new songTypes.SoundCloudSong(selected.info, selected.track))
			}
		}
	},

	async loadtracks(input: string, nodeID?: string): Promise<Array<{ track: string; info: import("../../types").LavalinkInfo }>> {
		const node = nodeID ? common.nodes.byID(nodeID) || common.nodes.random() : common.nodes.random()

		const params = new URLSearchParams()
		params.append("identifier", input)

		const data = await c(`http://${node.host}:${node.port}/loadtracks?${params.toString()}`).header("Authorization", node.password).send()
		const json = await data.json()
		if (json.exception) throw json.exception.message
		return json.tracks
	}
}

export = common
