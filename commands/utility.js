let rp = require("request-promise");
let router = require("../router.js");
let utility_info = {
	"ping": {
		description: "Displays the bot's latency to the Discord Gateway",
		arguments: "none",
		aliases: ["ping", "pong"],
		category: "utility"
	},
	"statistics": {
		description: "Gets more in depth statistics about the bot",
		arguments: "none",
		aliases: ["statistics", "stats"],
		category: "utility"
	},
	"uptime": {
		description: "Returns the amount of time since the bot process has started",
		arguments: "none",
		aliases: ["uptime"],
		category: "utility"
	},
	"info": {
		description: "Displays information about Amanda",
		arguments: "none",
		aliases: ["info", "inf"],
		category: "utility"
	},
	"commits": {
		description: "Gets the latest git commits to Amanda",
		arguments: "none",
		aliases: ["commits"],
		category: "utility"
	},
	"privacy": {
		description: "Details Amanda's privacy statement",
		arguments: "none",
		aliases: ["privacy"],
		category: "utility"
	},
	"invite": {
		description: "Sends the bot invite link to you via DMs",
		arguments: "none",
		aliases: ["invite", "inv"],
		category: "utility"
	}
}

router.emit("help", utility_info);
router.on("command", file_utility);
router.once(__filename, () => {
	router.removeListener("command", file_utility);
});

async function file_utility(passthrough) {
	let { Discord, client, msg, cmd, utils } = passthrough;

	if (cmd == "ping" || cmd == "pong") {
		return msg.channel.send(`Pong! Gateway latency is ${client.ping.toFixed(0)}ms`);
	}


	else if (cmd == "statistics" || cmd == "stats") {
		let ram = (((process.memoryUsage().rss - (process.memoryUsage().heapTotal - process.memoryUsage().heapUsed)) / 1024) / 1024).toFixed(2);
		let nmsg = await msg.channel.send("Ugh. I hate it when I'm slow, too");
		let embed = new Discord.RichEmbed()
		.addField(client.user.tag,
			`**❯ Gateway:**\n${client.ping.toFixed(0)}ms\n`+
			`**❯ Latency:**\n${nmsg.createdTimestamp - msg.createdTimestamp}ms\n`+
			`**❯ Uptime:**\n${process.uptime().humanize("sec")}\n`+
			`**❯ RAM Usage:**\n${ram}MB`, true)
		.addField("­",
			`**❯ User Count:**\n${client.users.size} users\n`+
			`**❯ Guild Count:**\n${client.guilds.size} guilds\n`+
			`**❯ Channel Count:**\n${client.channels.size} channels\n`+
			`**❯ Voice Connections:**\n${client.voiceConnections.size}`, true)
		.setFooter(`Requested by ${msg.author.username}`).setColor("36393E")
		return nmsg.edit({embed});
	}


	else if (cmd == "uptime") {
		let embed = new Discord.RichEmbed().addField("❯ Bot Uptime:", process.uptime().humanize("sec"), true).addField("❯ Online for:", client.uptime.humanize("ms"), true).setFooter("And still going").setColor("36393E");
		return msg.channel.send({embed});
	}


	else if (cmd == "info" || cmd == "inf") {
		let [c1, c2] = await Promise.all([
			client.fetchUser("320067006521147393"),
			client.fetchUser("176580265294954507")
		]);
		let embed = new Discord.RichEmbed()
			.setAuthor("Amanda", client.user.smallAvatarURL)
			.setDescription("Thank you for choosing me as your companion! :heart:\nHere's a little bit of info about me...")
			.addField("Creators",
				`${c1.tag} <:bravery:479939311593324557> <:NitroBadge:421774688507920406>\n`+
				`${c2.tag} <:brilliance:479939329104412672> <:NitroBadge:421774688507920406>`)
			.addField("Code", `[node.js](https://nodejs.org/) ${process.version} + [discord.js](https://www.npmjs.com/package/discord.js) ${Discord.version}`)
			.addField("Links", "Visit Amanda's [website](https://amandabot.ga/) or her [support server](https://discord.gg/zhthQjH)\nYou can also visit her listing sites at [Discord Bot List](https://discordbots.org/bot/405208699313848330) or on [Discord Bots](https://bots.discord.pw/bots/405208699313848330)")
			.addField("Partners",
				"axelgreavette, "+
				"[SHODAN](http://shodanbot.com) <:bot:412413027565174787>, "+
				"[Cadence](https://cadence.gq/), "+
				"[botrac4r](https://discordapp.com/oauth2/authorize?client_id=353703396483661824&scope=bot) <:bot:412413027565174787>")
			.setColor("36393E");
		return msg.channel.send(embed);
	}


	else if (cmd == "commits") {
		msg.channel.sendTyping();
		let limit = 5;
		let body = await rp("https://cadence.gq/api/amandacommits?limit="+limit);
		let data = JSON.parse(body);
		return msg.channel.send(new Discord.RichEmbed()
			.setTitle("Git info")
			.addField("Status", "On branch "+data.branch+", latest commit "+data.latestCommitHash)
			.addField(`Commits (latest ${limit} entries)`, data.logString)
			.setColor("36393E")
		);
	}

	
	else if (cmd == "privacy") {
		let embed = new Discord.RichEmbed().setAuthor("Privacy").setDescription("Amanda may collect basic user information. This data includes but is not limited to usernames, discriminators, profile pictures and user identifiers also known as snowflakes.This information is exchanged solely between services related to the improvement or running of Amanda and [Discord](https://discordapp.com/terms). It is not exchanged with any other providers. That's a promise. If you do not want your information to be used by the bot, remove it from your servers and do not use it").setColor("36393E")
		try {
			await msg.author.send({embed});
			if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
			return;
		} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
	}


	else if (cmd == "invite" || cmd == "inv") {
		let embed = new Discord.RichEmbed().setDescription("**I've been invited?**\n*Be sure that you have administrator permissions on the server you would like to invite me to*").setTitle("Invite Link").setURL("http://amanda.discord-bots.ga/").setColor("36393E")
		try {
			await msg.author.send({embed});
			if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
			return;
		} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
	}
};