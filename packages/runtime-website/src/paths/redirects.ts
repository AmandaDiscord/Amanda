import passthrough = require("../passthrough");
const { server, sync } = passthrough

const utils: typeof import("../utils") = sync.require("../utils")

const redirects = {
	stats: "https://cheweyz.github.io/discord-bot-analytics-dash/index.html?id=320067006521147393",
	patreon: "https://www.patreon.com/papiophidian",
	paypal: "https://paypal.me/papiophidian",
	server: "https://discord.gg/zhthQjH",
	add: "https://discord.com/api/oauth2/authorize?client_id=1109360903096369153&permissions=0&scope=bot%20applications.commands",
	todo: "https://github.com/AmandaDiscord/Amanda/projects",
	github: "https://github.com/AmandaDiscord",
	privacy: "https://github.com/AmandaDiscord/Amanda/blob/restart/PRIVACYPOLICY",
	tos: "https://github.com/AmandaDiscord/Amanda/blob/restart/TERMSOFSERVICE"
}

for (const [key, value] of Object.entries(redirects)) {
	server.get(`/to/${key}`, res => utils.redirect(res, value))
}
