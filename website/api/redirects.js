function redirect(statusCode, location) {
	return {
		statusCode,
		headers: {
			"Location": location
		},
		contentType: "text/html",
		content: `Redirecting to <a href="${location}">${location}</a>...`
	}
}

module.exports = [
	["/stats", "https://cheweyz.github.io/discord-bot-analytics-dash/index.html?id=320067006521147393"], // legacy, feel free to replace in future
	["/to/stats", "https://cheweyz.github.io/discord-bot-analytics-dash/index.html?id=320067006521147393"],
	["/to/patreon", "https://www.patreon.com/papiophidian"],
	["/to/paypal", "https://paypal.me/papiophidian"],
	["/to/server", "https://discord.gg/zhthQjH"],
	["/to/add", "https://discordapp.com/oauth2/authorize?client_id=405208699313848330&permissions=57344&scope=bot"],
	["/to/todo", "https://github.com/AmandaDiscord/Amanda/projects"],
	["/to/twitter", "https://twitter.com/AmandaDiscord"],
	["/to/github", "https://github.com/AmandaDiscord"],
	["/to/privacy", "https://github.com/AmandaDiscord/Amanda/blob/rained-in/PRIVACYPOLICY"]
].map(entry => ({
	route: entry[0],
	methods: ["GET"],
	code: () => {
		return Promise.resolve(redirect(302, entry[1]))
	}
}))
