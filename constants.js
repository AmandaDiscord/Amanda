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
	invite_link_for_help: "https://discord.gg/X5naRFu",
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
			invidious_origin: "http://cadence.moe:3000",
			regions: ["brazil", "us-central", "us-south", "us-east", "us-west", "eu-central", "europe", "eu-west", "sydney", "southafrica"],
			enabled: true
		},
		{
			name: "Crayon",
			host: "139.99.90.94",
			port: 10402,
			password: config.lavalink_password,
			invidious_origin: "http://139.99.90.94:3000",
			regions: ["hongkong", "japan", "singapore", "india", "russia", "south-korea"],
			enabled: true
		}
	]
}
