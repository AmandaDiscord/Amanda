type Path = {
	methods: Array<string>;
	static?: string;
	handle?: (req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL) => Promise<unknown>;
}

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
	tsukiko: "https://discord.com/api/oauth2/authorize?client_id=709907646387322932&permissions=268510208&scope=bot%20applications.commands"
}

const paths = {
	"/": {
		methods: ["GET", "HEAD"],
		static: "index.html"
	},
	"/about": {
		methods: ["GET", "HEAD"],
		static: "about.html"
	}
} as { [path: string]: Path }

async function redirect(res: import("http").ServerResponse, location: string) {
	res.writeHead(302, { Location: location, "Content-Type": "text/html" }).end(`Redirecting to <a href="${location}">${location}</a>...`)
}

for (const [key, value] of Object.entries(redirects)) {
	paths[`/to/${key}`] = {
		methods: ["GET"],
		handle: (_req, res) => redirect(res, value)
	}
}

const routes = {
} as {
	[route: string]: {
		methods: Array<string>;
		router: (req: import("http").IncomingMessage, res: import("http").ServerResponse, url: URL, ...params: Array<string>) => Promise<unknown>;
	}
}

const compiledRegexes = {} as { [route: string]: RegExp }

for (const key of Object.keys(routes)) {
	compiledRegexes[key] = new RegExp(key)
}

const prox = new Proxy(paths, {
	get(target, property, receiver) {
		const existing = Reflect.get(target, property, receiver)
		if (existing) return existing
		const prop = property.toString();
		const routeKey = prop.replace(/\/(\d+)(\/)?/g, "/(\\d+)$2")
		if (routes[routeKey]) {
			const match = prop.match(compiledRegexes[routeKey])
			if (!match) throw new Error("PANIC_COMPILED_REGEX_NO_MATCHES")
			const params = match.slice(1)
			return {
				methods: routes[routeKey].methods,
				handle: (req, res, url) => routes[routeKey].router(req, res, url, ...params)
			} as Path
		} else return void 0
	}
})

export = prox
