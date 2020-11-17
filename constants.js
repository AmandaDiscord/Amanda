const config = require("./config.js")
const baseURL = `${config.website_protocol}://${config.website_domain}`

module.exports = {
	baseURL: baseURL,
	patreon: `${baseURL}/to/patreon`,
	paypal: `${baseURL}/to/paypal`,
	twitch: "https://www.twitch.tv/papiophidian",
	add: `${baseURL}/to/add`,
	server: `${baseURL}/to/server`,
	invite_link_for_help: "https://discord.gg/X5naRFu",
	stats: `${baseURL}/to/stats`,
	frisky_placeholder: `${baseURL}/images/frisky-small.png`,
	soundcloud_placeholder: `${baseURL}/images/soundcloud-logo-rectangle.jpg`,
	spotify_placeholder: `${baseURL}/images/spotify-logo.png`,
	avatar: `${baseURL}/images/amanda.png`,
	chewey_api: "https://api.chewey-bot.top",
	money_embed_color: 0xf8e71c,
	standard_embed_color: 0x2f3136,
	discord_background_color: 0x36393f,
	fake_token: "(token)",
	/** @type {{ id: string, name: string, host: string, port: number, password: string, invidious_origin: string, regions: string[], enabled: boolean, search_with_invidious: boolean}[]} */
	lavalinkNodes: []
}
