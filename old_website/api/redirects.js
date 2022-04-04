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
	["/to/stats", "https://cheweyz.github.io/discord-bot-analytics-dash/index.html?id=320067006521147393"],
	["/to/patreon", "https://www.patreon.com/papiophidian"],
	["/to/paypal", "https://paypal.me/papiophidian"],
	["/to/server", "https://discord.gg/zhthQjH"],
	["/to/add", "https://discord.com/api/oauth2/authorize?client_id=405208699313848330&permissions=36700160&scope=bot%20applications.commands"],
	["/to/todo", "https://github.com/AmandaDiscord/Amanda/projects"],
	["/to/twitter", "https://twitter.com/AmandaDiscord"],
	["/to/github", "https://github.com/AmandaDiscord"],
	["/to/privacy", "https://github.com/AmandaDiscord/Amanda/blob/rewrite/PRIVACYPOLICY"],
	["/to/tos", "https://github.com/AmandaDiscord/Amanda/blob/rewrite/TERMSOFSERVICE"],
	["/to/tsukiko", "https://discord.com/oauth2/authorize?client_id=709907646387322932&permissions=268714048&scope=bot"]
].map(entry => ({
	route: entry[0],
	methods: ["GET"],
	code: () => {
		return Promise.resolve(redirect(302, entry[1]))
	}
}))
