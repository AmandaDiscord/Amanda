let rp = require("request-promise");

module.exports = function(passthrough) {
	let { Discord, client, utils, commands, reloadEvent } = passthrough;

	sendStatsTimeout = setTimeout(sendStatsTimeoutFunction, 1000*60*60 - (Date.now() % (1000*60*60)));
	function sendStatsTimeoutFunction() {
		sendStats();
		sendStatsTimeout = setTimeout(sendStatsTimeoutFunction, 1000*60*60);
	}

	reloadEvent.once(__filename, () => {
		clearTimeout(sendStatsTimeout);
	});

	async function sendStats(msg) {
		console.log("Sending stats...");
		let now = Date.now();
		let myid = client.user.id;
		let ramUsageKB = Math.floor(((process.memoryUsage().rss - (process.memoryUsage().heapTotal - process.memoryUsage().heapUsed)) / 1024))
		let users = client.users.size;
		let guilds = client.guilds.size;
		let channels = client.channels.size;
		let voiceConnections = client.voiceConnections.size;
		let uptime = process.uptime();
		await utils.sql.all("INSERT INTO StatLogs VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [now, myid, ramUsageKB, users, guilds, channels, voiceConnections, uptime]);
		if (msg) msg.react("👌");
		console.log("Sent stats.", new Date().toUTCString());
	}

	return {
		"statistics": {
			usage: "",
			description: "Displays detailed statistics",
			aliases: ["statistics", "stats"],
			category: "meta",
			process: async function(msg) {
				let ramUsage = (((process.memoryUsage().rss - (process.memoryUsage().heapTotal - process.memoryUsage().heapUsed)) / 1024) / 1024).toFixed(2);
				let nmsg = await msg.channel.send("Ugh. I hate it when I'm slow, too");
				const embed = new Discord.RichEmbed()
				.addField(client.user.tag+" "+client.user.presenceEmoji,
					`**❯ Gateway:**\n${client.ping.toFixed(0)}ms\n`+
					`**❯ Latency:**\n${nmsg.createdTimestamp - msg.createdTimestamp}ms\n`+
					`**❯ Uptime:**\n${process.uptime().humanize("sec")}\n`+
					`**❯ RAM Usage:**\n${ramUsage}MB`, true)
				.addField("­",
					`**❯ User Count:**\n${client.users.size} users\n`+
					`**❯ Guild Count:**\n${client.guilds.size} guilds\n`+
					`**❯ Channel Count:**\n${client.channels.size} channels\n`+
					`**❯ Voice Connections:**\n${client.voiceConnections.size}`, true)
				.setColor("36393E")
				nmsg.edit({embed});
			}
		},

		"ping": {
			usage: "",
			description: "Gets latency to Discord",
			aliases: ["ping", "pong"],
			category: "meta",
			process: async function (msg) {
				let array = ["So young... So damaged...", "We've all got no where to go...","You think you have time...", "Only answers to those who have known true despair...", "Hopeless...", "Only I know what will come tomorrow...", "So dark... So deep... The secrets that you keep...", "Truth is false...", "Despair..."];
				let message = array[Math.floor(Math.random() * array.length)];
				let nmsg = await msg.channel.send(message);
				const embed = new Discord.RichEmbed().setAuthor("Pong!").addField("❯ Gateway:", `${client.ping.toFixed(0)}ms`, true).addField(`❯ Message Send:`, `${nmsg.createdTimestamp - msg.createdTimestamp}ms`, true).setFooter("W-Wait... It's called table tennis").setColor("36393E")
				nmsg.edit({embed});
			}
		},

		"forcestatupdate": {
			usage: "",
			description: "",
			aliases: ["forcestatupdate"],
			category: "dev",
			process: function(msg) {
				sendStats(msg);
			}
		},

		"invite": {
			usage: "",
			description: "Sends the bot invite link to you via DMs",
			aliases: ["invite", "inv"],
			category: "meta",
			process: async function(msg) {
				const embed = new Discord.RichEmbed().setDescription("**I've been invited?**\n*Be sure that you have administrator permissions on the server you would like to invite me to*").setTitle("Invite Link").setURL("http://amanda.discord-bots.ga/").setColor("36393E")
				try {
					await msg.author.send({embed});
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} catch (reason) {
					return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`);
				}
			}
		},

		"info": {
			usage: "",
			description: "Displays information about Amanda",
			aliases: ["info", "inf"],
			category: "meta",
			process: async function(msg, suffix) {
				let [c1, c2] = await Promise.all([
					client.fetchUser("320067006521147393"),
					client.fetchUser("176580265294954507")
				]);
				const embed = new Discord.RichEmbed()
					.setAuthor("Amanda", client.user.smallAvatarURL)
					.setDescription("Thank you for choosing me as your companion! :heart:\nHere's a little bit of info about me...")
					.addField("Creators",
						`${c1.tag} <:bravery:479939311593324557> <:NitroBadge:421774688507920406>\n`+
						`${c2.tag} <:brilliance:479939329104412672> <:NitroBadge:421774688507920406>`)
					.addField("Code", `[node.js](https://nodejs.org/) ${process.version} + [discord.js](https://www.npmjs.com/package/discord.js) ${Discord.version}`)
					.addField("Links", "Visit Amanda's [website](https://amandabot.ga/) or her [support server](https://discord.gg/zhthQjH)\nYou can also visit her listing sites at [Discord Bot List](https://discordbots.org/bot/405208699313848330) or on [Discord Bots](https://bots.discord.pw/bots/405208699313848330)")
					.addField("Partners",
						"axelgreavette <:HypeBadge:421764718580203530>, "+
						"[SHODAN](http://shodanbot.com) <:bot:412413027565174787>, "+
						"[Cadence](https://cadence.gq/) <:NitroBadge:421774688507920406>, "+
						"[botrac4r](https://discordapp.com/oauth2/authorize?client_id=353703396483661824&scope=bot) <:bot:412413027565174787>")
					.setColor("36393E");
				msg.channel.send(embed);
			}
		},

		"commits": {
			usage: "",
			description: "Gets the latest git commits to Amanda",
			aliases: ["commits", "commit", "git"],
			category: "meta",
			process: async function(msg, suffix) {
				msg.channel.sendTyping();
				const limit = 5;
				let body = await rp("https://cadence.gq/api/amandacommits?limit="+limit);
				let data = JSON.parse(body);
				msg.channel.send(new Discord.RichEmbed()
					.setTitle("Git info")
					.addField("Status", "On branch "+data.branch+", latest commit "+data.latestCommitHash)
					.addField(`Commits (latest ${limit} entries)`, data.logString)
					.setColor("36393E")
				);
			}
		},

		"privacy": {
			usage: "",
			description: "Details Amanda's privacy statement",
			aliases: ["privacy"],
			category: "meta",
			process: async function(msg, suffix) {
				const embed = new Discord.RichEmbed().setAuthor("Privacy").setDescription("Amanda may collect basic user information. This data includes but is not limited to usernames, discriminators, profile pictures and user identifiers also known as snowflakes.This information is exchanged solely between services related to the improvement or running of Amanda and [Discord](https://discordapp.com/terms). It is not exchanged with any other providers. That's a promise. If you do not want your information to be used by the bot, remove it from your servers and do not use it").setColor("36393E")
				try {
					await msg.author.send({embed});
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} catch (reason) {
					return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`);
				}
			}
		},

		"commands": {
			usage: "<category>",
			description: "Shows the command list from a specific category of commands",
			aliases: ["commands", "cmds"],
			category: "meta",
			process: async function(msg, suffix) {
				if (!suffix) return msg.channel.send(`${msg.author.username}, you must provide a command category as an argument`);
				let cat = Object.values(commands).filter(c => c.category == suffix.toLowerCase());
				let embed;
				if (suffix.toLowerCase() == "music") {
					embed = new Discord.RichEmbed()
						.setAuthor("&music: command help [music, m]")
						.addField(`play`, `Play a song or add it to the end of the queue. Use any YouTube video or playlist url or video name as an argument.\n\`&music play https://youtube.com/watch?v=e53GDo-wnSs\` or\n\`&music play despacito 2\``)
						.addField(`insert`, `Works the same as play, but inserts the song at the start of the queue instead of at the end.\n\`&music insert https://youtube.com/watch?v=e53GDo-wnSs\``)
						.addField(`now`, `Show the current song.\n\`&music now\``)
						.addField(`related [play|insert] [index]`,
							"Show videos related to what's currently playing. Specify either `play` or `insert` and an index number to queue that song.\n"+
							"`&music related` (shows related songs)\n"+
							"`&music rel play 8` (adds related song #8 to the end of the queue)")
						.addField(`queue`, `Shows the current queue.\n\`&music queue\``)
						.addField(`shuffle`, `Shuffle the queue. Does not affect the current song.\n\`&music shuffle\``)
						.addField(`skip`, `Skip the current song and move to the next item in the queue.\n\`&music skip\``)
						.addField(`stop`, `Empty the queue and leave the voice channel.\n\`&music stop\``)
						.addField(`volume <amount>`, `Set the music volume. Must be a whole number from 0 to 5. Default volume is 5.\n\`&music volume 3\``)
						.addField(`playlist`, `Manage playlists. Try \`&cmds playlist\` for more info.`)
						.setColor('36393E')
					try {
						await msg.author.send({embed});
						if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
						return;
					} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
				}
				if (suffix.toLowerCase() == "playlist") {
					embed = new Discord.RichEmbed()
						.setAuthor(`&music playlist: command help`)
						.setDescription("All playlist commands begin with `&music playlist` followed by the name of a playlist. "+
							"If the playlist name does not exist, you will be asked if you would like to create a new playlist with that name.\n"+
							"Note that using `add`, `remove`, `move` and `import` require you to be the owner (creator) of a playlist.")
						.addField("play [start] [end]", "Play a playlist.\n"+
							"Optionally, specify values for start and end to play specific songs from a playlist. "+
							"Start and end are item index numbers, but you can also use `-` to specify all songs towards the list boundary.\n"+
							"`&music playlist xi play` (plays the entire playlist named `xi`)\n"+
							"`&music playlist xi play 32` (plays item #32 from the playlist)\n"+
							"`&music playlist xi play 3 6` (plays items #3, #4, #5 and #6 from the playlist)\n"+
							"`&music playlist xi play 20 -` (plays all items from #20 to the end of the playlist)")
						.addField("shuffle [start] [end]", "Play the songs from a playlist in a random order. Works exactly like `play`.\n`&music playlist xi shuffle`")
						.addField("add <url>", "Add a song to playlist. Specify a URL the same as `&music play`.\n"+
							"`&music playlist xi add https://youtube.com/watch?v=e53GDo-wnSs`")
						.addField("remove <index>", "Remove a song from a playlist.\n"+
							"`index` is the index of the item to be removed.\n"+
							"`&music playlist xi remove 12`")
						.addField("move <index1> <index2>", "Move items around within a playlist. "+
							"`index1` is the index of the item to be moved, `index2` is the index of the position it should be moved to.\n"+
							"The indexes themselves will not be swapped with each other. Instead, all items in between will be shifted up or down to make room. "+
							"If you don't understand what this means, try it out yourself.\n"+
							"`&music playlist xi move 12 13`")
						.addField("import <url>", "Import a playlist from YouTube into Amanda. `url` is a YouTube playlist URL.\n"+
							"`&music playlist undertale import https://www.youtube.com/playlist?list=PLpJl5XaLHtLX-pDk4kctGxtF4nq6BIyjg`")
						.setColor('36393E')
					try {
						await msg.author.send({embed});
						if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
						return;
					} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
				}
				if (!cat || cat.toString().length < 1 || suffix.toLowerCase() == "admin") {
					embed = new Discord.RichEmbed().setDescription(`**${msg.author.tag}**, It looks like there isn't anything here but the almighty hipnotoad`).setColor('36393E')
					return msg.channel.send({embed});
				}

				let str = cat.map(c => `${c.aliases[0]}    [${c.aliases.join(", ")}]`).sort().join("\n");
				embed = new Discord.RichEmbed().setAuthor(`${suffix.toLowerCase()} command list`).setTitle("command    [aliases]").setDescription(str).setColor("36393E")
				try {
					await msg.author.send({embed});
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
					return;
				} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
			}
		},

		"help": {
			usage: "<command>",
			description: "Your average help command",
			aliases: ["help", "h"],
			category: "meta",
			process: async function (msg, suffix) {
				let embed;
				if (suffix) {
					let args = suffix.split(" ");
					let command = Object.values(commands).find(c => c.aliases.includes(args[0]));
					if (command) {
						embed = new Discord.RichEmbed().addField(`Help for ${command.aliases[0]}`, `Arguments: ${command.usage}\nDescription: ${command.description}\nAliases: [${command.aliases.join(", ")}]\nCategory: ${command.category}`).setColor('36393E');
						return msg.channel.send({embed});
					} else {
						embed = new Discord.RichEmbed().setDescription(`**${msg.author.tag}**, I couldn't find the help panel for that command`).setColor("B60000");
						return msg.channel.send({embed});
					}
				} else {
					let all = Object.values(commands).map(c => c.category);
					let filter = (value, index, self) => { return self.indexOf(value) == index; };
					let cats = all.filter(filter).sort();
					embed = new Discord.RichEmbed().setAuthor("Command Categories").setDescription(`❯ ${cats.join("\n❯ ")}\n\n𝓲 - typing \`&cmds <category>\` will show all cmds in that category`).setFooter("Amanda help panel", client.user.smallAvatarURL).setColor('36393E');
					try {
						await msg.author.send({embed});
						if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
					} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
				}
			}
		}
	}
}
