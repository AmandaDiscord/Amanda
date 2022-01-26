import Discord from "thunderstorm"
import genius from "genius-lyrics-api"
import c from "centra"

import passthrough from "../../passthrough"
const { constants, config, sync } = passthrough

const arr = sync.require("../../utils/array") as typeof import("../../utils/array")

const fakeHTTPAgent = `Mozilla/5.0 (Server; NodeJS ${process.version}; rv:1.0) Neko/1.0 (KHTML, like Gecko) Amanda/1.0`

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

	async loadtracks(input: string, nodeID?: string): Promise<Array<{ track: string; info: import("../../types").LavalinkInfo }>> {
		const node = nodeID ? common.nodes.byID(nodeID) || common.nodes.random() : common.nodes.random()

		const params = new URLSearchParams()
		params.append("identifier", input)

		const data = await c(`http://${node.host}:${node.port}/loadtracks?${params.toString()}`).header("Authorization", node.password).send()
		const json = await data.json()
		if (json.exception) throw json.exception.message
		return json.tracks
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

			/* if (song instanceof songTypes.SpotifySong || song instanceof songTypes.SoundCloudSong) {
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
			} else standard() */
			standard()

			return { title, artist }
		}
	},

	inputToID(input: string): { type: "soundcloud" | "spotify" | "newgrounds" | "youtube" | "playlist" | "twitter" | "itunes" | "external"; link?: string | null, id?: string | null } | null {
		input = input.replace(/(^<|>$)/g, "")
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
					return null
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
				} else return null // YouTube-compatible, but can't resolve to a video.
			} else if (url.hostname == "twitter.com" && url.pathname.match(/\/[\w\d]+\/status\/\d+/)) {
				return { type: "twitter", link: url.toString() }
			} else if (url.hostname === "music.apple.com" && url.pathname.match(/\/album\/[^/]+\//)) {
				return { type: "itunes", link: url.toString() }
			} else return { type: "external", link: url.toString() } // Possibly a link to an audio file
		} catch (e) {
			// Not a URL. Might be an ID?
			if (input.match(/^[A-Za-z0-9_-]{11}$/)) return { type: "youtube", id: input }
			else return null
		}
	}
}

export = common
