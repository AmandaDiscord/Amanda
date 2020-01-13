const config = require("./config.js")
const baseURL = `${config.website_protocol}://${config.website_domain}`

module.exports = {
	patreon: `${baseURL}/to/patreon`,
	paypal: `${baseURL}/to/paypal`,
	twitch: "https://www.twitch.tv/papiophidian",
	add: `${baseURL}/to/add`,
	server: `${baseURL}/to/server`,
	stats: `${baseURL}/to/stats`,
	frisky_placeholder: `${baseURL}/images/frisky-small.png`,
	avatar: `${baseURL}/images/amanda.png`,
	chewey_api: "https://api.chewey-bot.top",
	money_embed_color: 0xf8e71c
}
