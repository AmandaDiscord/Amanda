function redirect(statusCode, location) {
	return {
		statusCode,
		headers: {
			"Location": location
		},
		contentType: "text/html",
		content: "Redirecting..."
	}
}

module.exports = [
	{ route: "/stats", methods: ["GET"], code: () => {
		return Promise.resolve(redirect(302, "https://cheweyz.github.io/discord-bot-analytics-dash/index.html?id=320067006521147393"))
	} }
]
