const redirects = {
	stats: "https://cheweyz.github.io/discord-bot-analytics-dash/index.html?id=320067006521147393",
	patreon: "https://www.patreon.com/papiophidian",
	paypal: "https://paypal.me/papiophidian",
	server: "https://discord.gg/zhthQjH",
	add: "https://discord.com/api/oauth2/authorize?client_id=405208699313848330&permissions=36700160&scope=bot%20applications.commands",
	todo: "https://github.com/AmandaDiscord/Amanda/projects",
	twitter: "https://twitter.com/AmandaDiscord",
	github: "https://github.com/AmandaDiscord",
	privacy: "https://github.com/AmandaDiscord/Amanda/blob/rewrite/PRIVACYPOLICY",
	tos: "https://github.com/AmandaDiscord/Amanda/blob/rewrite/TERMSOFSERVICE",
	tsukiko: "https://discord.com/oauth2/authorize?client_id=709907646387322932&permissions=268714048&scope=bot"
}

const paths = {
	"/": {
		methods: ["GET"],
		static: "index.html"
	},
	"/about": {
		methods: ["GET"],
		static: "about.html"
	}
} as { [path: string]: { methods: Array<string>; static?: string; handle?: (req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL) => Promise<unknown>; } }

async function redirect(res: import("http").ServerResponse, location: string) {
	res.writeHead(302, { Location: location, "Content-Type": "text/html" }).write(`Redirecting to <a href="${location}">${location}</a>...`)
	res.end()
}
for (const [key, value] of Object.entries(redirects)) {
	paths[`/to/${key}`] = {
		methods: ["GET"],
		handle: (_req, res) => redirect(res, value)
	}
}
export = paths
