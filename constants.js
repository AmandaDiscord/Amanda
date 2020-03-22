const Discord = require("discord.js")
const config = require("./config.js")
const baseURL = `${config.website_protocol}://${config.website_domain}`

module.exports = {
	baseURL: baseURL,
	patreon: `${baseURL}/to/patreon`,
	paypal: `${baseURL}/to/paypal`,
	twitch: "https://www.twitch.tv/papiophidian",
	add: `${baseURL}/to/add`,
	server: `${baseURL}/to/server`,
	stats: `${baseURL}/to/stats`,
	frisky_placeholder: `${baseURL}/images/frisky-small.png`,
	avatar: `${baseURL}/images/amanda.png`,
	chewey_api: "https://api.chewey-bot.top",
	money_embed_color: 0xf8e71c,
	lavalinkNodes: [
		{
			name: "Pencil",
			host: "amanda.moe",
			port: 10402,
			password: config.lavalink_password,
			regions: ["brazil", "us-central", "us-south", "us-east", "us-west", "eu-central", "europe", "eu-west", "sydney", "southafrica"]
		},
		{
			name: "Crayon",
			host: "139.99.90.94",
			port: 10402,
			password: config.lavalink_password,
			regions: ["hongkong", "japan", "singapore", "india", "russia", "south-korea"]
		}
	]
}
