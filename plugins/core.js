const fs = require("fs");
const Auth = JSON.parse(fs.readFileSync("./auth.json", "utf8"));
const os = require("os");
const util = require("util");
const { exec } = require("child_process");

module.exports = function(passthrough) {
	const {Discord, djs, dio, dbs, utils, commands} = passthrough;
	let sql = dbs[0];
	return {
		"uptime": {
			usage: "",
			description: "Returns the amount of time since Amanda has started",
			aliases: ["uptime"],
			process: function(msg, suffix) {
				const embed = new Discord.RichEmbed()
					.setAuthor("Uptime")
					.addField("❯ Bot Uptime:", `${utils.humanize(process.uptime(), "sec")}`)
					.setFooter("And still going")
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},

		"stats": {
			usage: "",
			description: "Displays detailed statistics of Amanda",
			aliases: ["stats"],
			process: function(msg, suffix) {
				var ramUsage = ((process.memoryUsage().heapUsed / 1024) / 1024).toFixed(2);
				const embed = new Discord.RichEmbed()
					.setAuthor("Statistics")
					.addField("❯ API Latency:", `${djs.ping.toFixed(0)}ms`)
					.addField(`❯ Message Latency:`, `${Date.now() - msg.createdTimestamp}ms`)
					.addField("❯ Bot Uptime:", `${utils.humanize(process.uptime(), "sec")}`)
					.addField("❯ RAM Usage:", `${ramUsage}MB`)
					.addField("❯ User Count:", `${djs.users.size} users`)
					.addField("❯ Guild Count:", `${djs.guilds.size} guilds`)
					.addField("❯ Channel Count:", `${djs.channels.size} channels`)
					.setFooter(`Requested by ${msg.author.username}`)
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},

		"ping": {
			usage: "",
			description: "Tests Amanda's network latency.",
			aliases: ["ping", "pong"],
			process: async function (msg, suffix) {
				var array = ["So young... So damaged...", "We've all got no where to go...","You think you have time...", "Only answers to those who have known true despair...", "Hopeless...", "Only I know what will come tomorrow...", "So dark... So deep... The secrets that you keep...", "Truth is false...", "Despair..."];
				var message = array[Math.floor(Math.random() * array.length)];
				var footers = ["Is that slow?", "W-Wait... It's called table tennis"];
				var footer = footers[Math.floor(Math.random() * footers.length)];
				const embed = new Discord.RichEmbed()
					.setAuthor("Pong!")
					.addField("❯ API Latency:", `${djs.ping.toFixed(0)}ms`)
					.addField(`❯ Message Latency:`, `${Date.now() - msg.createdTimestamp}ms`)
					.setFooter(footer)
					.setColor("36393E")
				var nmsg = await msg.channel.send(message);
				nmsg.edit({embed});
			}
		},

		"invite": {
			usage: "",
			description: "Sends the bot invite link to you via DMs",
			aliases: ["invite", "inv"],
			process: function(msg, suffix) {
				const embed = new Discord.RichEmbed()
					.setDescription("<:discord:419242860156813312> **I've been invited?**\n*Be sure that you have administrator permissions on the server you would like to invite me to*")
					.setTitle("Invite Link")
					.setURL("http://amanda.discord-bots.ga/")
					.setFooter("Amanda", djs.user.avatarURL)
					.setColor("36393E")
				msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
			}
		},

		"info": {
			usage: "",
			description: "Displays information about Amanda",
			aliases: ["info", "inf"],
			process: function(msg, suffix) {
				const embed = new Discord.RichEmbed()
					.setAuthor("Information:")
					.setColor("36393E")
					.setDescription("Thank you for choosing me as your companion :heart: Here's a little bit of info about me.")
					.addField("Creator:", "PapiOphidian#8685 <:HypeBadge:421764718580203530> <:NitroBadge:421774688507920406>")
					.addField("Lang:", `Node.js ${process.version}`)
					.addField("Library:", "[Dualcord](https://www.npmjs.com/package/dualcord)")
					.addField("Description:", "A cutie-pie general purpose bot that only wishes for some love.")
					.addField("More Info:", "Visit Amanda's [website](https://amandabot.ga/) or her [support server](http://papishouse.discords.ga)")
					.addBlankField(true)
					.addField("Partners:", "axelgreavette <:HypeBadge:421764718580203530>\n[SHODAN](http://shodanbot.com) <:bot:412413027565174787>\n[cloudrac3r](https://cadence.gq/) <:NitroBadge:421774688507920406>\n[botrac4r](https://discordapp.com/oauth2/authorize?client_id=353703396483661824&scope=bot) <:bot:412413027565174787>")
					.setFooter("Amanda", djs.user.avatarURL)
					.setColor(504277)
				msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
			}
		},

		"privacy": {
			usage: "",
			description: "Details Amanda's privacy statement",
			aliases: ["privacy"],
			process: function(msg, suffix) {
				const embed = new Discord.RichEmbed()
					.setAuthor("Privacy")
					.setDescription("Amanda collects basic user information which includes, but is not limited to, usernames and discriminators, profile pictures and their urls and user Snowflakes/IDs. This information is solely used to bring you content relevant to the command executed and that data is not stored anywhere where it is not essential for the bot to operate. In other words, only data that's needed which is relevant to the command is being used and your information or how you use the bot is not collected and sent to external places for others to see. That's a promise. If you do not want your information to be used by the bot, remove it from your servers and do not use it")
					.setFooter("Amanda", djs.user.avatarURL)
					.setColor("36393E")
				msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
			}
		},

		"commands": {
			usage: "<category>",
			description: "Shows the command list from a specific category of commands",
			aliases: ["commands", "cmds"],
			process: async function(msg, suffix) {
				if (!suffix) return msg.channel.send(`${msg.author.username}, you must provide a command category as an argument`);
				if (suffix.toLowerCase() == "core") {
					const embed = new Discord.RichEmbed()
						.setAuthor(`Core command list:`)
						.setDescription(`&help <command>\n&commands <category>\n&invite\n&info\n&privacy`)
						.setColor('36393E')
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else if (suffix.toLowerCase() == "statistics") {
					const embed = new Discord.RichEmbed()
						.setAuthor(`Statistics command list:`)
						.setDescription(`&ping\n&uptime\n&stats`)
						.setColor('36393E')
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else if (suffix.toLowerCase() == "gambling") {
					const embed = new Discord.RichEmbed()
						.setAuthor(`Gambling command list:`)
						.setDescription(`&give <amount> <user>\n&coins <user>\n&slot <amount>\n&flip\n&bf <amount> <side>\n&lb\n&mine\n&dice\n&waifu <user>\n&claim <amount> <user>`)
						.setColor('36393E')
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else if (suffix.toLowerCase() == "guild") {
					const embed = new Discord.RichEmbed()
						.setAuthor(`Guild command list:`)
						.addField(`**Moderation:**`, `&ban <user>\n&hackban <id>\n&kick <user>\n&tidy <# to delete>`)
						.addField(`**Information:**`, `&guild\n&user <user>\n&emoji <:emoji:>\n&emojilist\n&wumbo <:emoji>`)
						.addField(`**Interaction:**`, `&bean <user>\n&poke <user>\n&boop <user>\n&hug <user>\n&cuddle <user>\n&pat <user>\n&kiss <user>\n&slap <user>\n&stab <user>\n&nom <user>\n&ship <user 1> <user 2>`)
						.setColor('36393E')
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else if (suffix.toLowerCase() == "fun") {
					const embed = new Discord.RichEmbed()
						.setAuthor(`Fun command list:`)
						.setDescription(`&trivia <play / categories>\n&norris\n&yomamma\n&randnum <min#> <max#>\n&yn <question>\n&ball <question>\n&rate <thing to rate>`)
						.setColor('36393E')
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else if (suffix.toLowerCase() == "search") {
					const embed = new Discord.RichEmbed()
						.setAuthor(`Search command list:`)
						.setDescription(`&urban <search terms>`)
						.setColor('36393E')
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else if (suffix.toLowerCase() == "images") {
					const embed = new Discord.RichEmbed()
						.setAuthor(`Images command list:`)
						.setDescription(`&cat\n&dog\n&space\n&meme`)
						.setColor('36393E')
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else if (suffix.toLowerCase() == "music") {
					const embed = new Discord.RichEmbed()
						.setAuthor(`&music: command help`)
						.addField("play", "Play a song or add it to the queue. Use any YouTube url as an argument.\n`&music play https://youtube.com/watch?v=e53GDo-wnSs`")
						.addField("now", "Show the current song.\n`&music now`")
						.addField("queue", "Show the current queue.\n`&music queue`")
						.addField("shuffle", "Shuffle the queue. Does not affect the current song.\n`&music queue`")
						.addField("skip", "Skip the current song and move to the next item in the queue.\n`&music skip`")
						.addField("stop", "Empty the queue and leave the voice channel.\n`&music stop`")
						.addField("volume <amount>", "Set the music volume. Must be a whole number from 0 to 5. Default volume is 5.\n`&music volume 5`")
						.addField("playlist", "Manage playlists. Try `&commands playlists` for more info.")
						.setColor('36393E')
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else if (suffix.toLowerCase().startsWith("music playlist")) {
					const embed = new Discord.RichEmbed()
						.setAuthor(`&music playlist: command help`)
						.setDescription("All playlist commands begin with `&music playlist` followed by the name of a playlist. "+
							"If the playlist name does not exist, you will be asked if you would like to create a new playlist with that name.\n"+
							"Note that using `add`, `remove` and `move` require you to be the owner (creator) of a playlist.")
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
						.setColor('36393E')
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else if (suffix.toLowerCase() == "all") {
					const embed = new Discord.RichEmbed()
						.setAuthor(`Full command list`)
						.addField(`**❯ Core:**`, `&help <command>\n&commands <category>\n&invite\n&info\n&privacy`)
						.addField(`**❯ Statistics:**`, `&ping\n&uptime\n&stats`)
						.addField(`**❯ Gambling:**`, `&give <amount> <user>\n&coins <user>\n&slot <amount>\n&flip\n&bf <amount> <side>\n&lb\n&mine\n&dice\n&waifu <user>\n&claim <amount> <user>`)
						.addField(`**❯ Guild:**`, `**Moderation:**\n&ban <user>\n&hackban <id>\n&kick <user>\n&tidy <# to delete>\n**Information:**\n&guild\n&user <user>\n&emoji <:emoji:>\n&emojilist\n&wumbo <:emoji:>\n**Interaction:**\n&bean <user>\n&poke <user>\n&boop <user>\n&hug <user>\n&cuddle <user>\n&pat <user>\n&kiss <user>\n&slap <user>\n&stab <user>\n&nom <user>\n&ship <user 1> <user 2>`)
						.addField(`**❯ Fun:**`, `&trivia <play / categories>\n&norris\n&yomamma\n&randnum <min#> <max#>\n&yn <question>\n&ball <question>\n&rate <thing to rate>`)
						.addField(`**❯ Search:**`, `&urban <search terms>`)
						.addField(`**❯ Images:**`, `&cat\n&dog\n&space\n&meme`)
						.addField(`**❯ Music:**`, `&music - see \`&commands music\` for help`)
						//.addField(`**❯ NSFW:**`, `Null`)
						.setColor('36393E')
						.setFooter("Amanda help pane", `https://cdn.discordapp.com/avatars/${djs.user.id}/${djs.user.avatar}.png?size=32`)
					await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				} else {
					const embed = new Discord.RichEmbed()
						.setDescription(`**${msg.author.tag}**, It looks like there isn't anything here but the almighty hipnotoad`)
						.setColor('36393E')
					msg.channel.send({embed});
				}
			}
		},

		"help": {
			usage: "<command>",
			description: "Your average help command",
			aliases: ["help", "h"],
			process: async function (msg, suffix) {
				if(suffix) {
					var cmd = Object.values(commands).find(c => c.aliases.includes(suffix));
					if (!cmd) {
						const embed = new Discord.RichEmbed()
							.setDescription(`**${msg.author.tag}**, I couldn't find the help panel for that command`)
							.setColor("B60000")
						return msg.channel.send({embed});
					}
					const embed = new Discord.RichEmbed()
						.addField(`Help for ${cmd.aliases[0]}:`, `Usage: ${cmd.usage}\nDescription: ${cmd.description}\nAliases: [${cmd.aliases.join(", ")}]`)
						.setColor('36393E')
					msg.channel.send({embed});
				} else {
					const embed = new Discord.RichEmbed() // \n❯ NSFW
						.setAuthor("Command Categories:")
						.setDescription(`❯ Core\n❯ Statistics\n❯ Gambling\n❯ Guild\n❯ Fun\n❯ Search\n❯ Images\n❯ Music\n\n:information_source: **Typing \`&commands <category>\` will get you a list of all of the commands in that category. Ex: \`&commands core\`. Also typing \`&commands all\` will return all of the available commands**`)
						.setFooter("Amanda help panel", djs.user.avatarURL)
						.setColor('36393E')
						await msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work`));
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				}
			}
		},

		"evaluate": {
			usage: "<code>",
			description: "Executes arbitrary JavaScript in the bot process. Requires bot owner permissions",
			aliases: ["evaluate", "eval"],
			process: async function (msg, suffix) {
				if (["320067006521147393", "366385096053358603", "176580265294954507"].includes(msg.author.id))  {
					let result = await eval(suffix);
					if (!result) return result;
					msg.channel.send(util.inspect(result).replace(new RegExp(Auth.bot_token,"g"),"No")).catch(reason => msg.channel.send(`Uh oh. There was an error sending that message\n${reason}`));
				} else {
					var nope = [["no", 300], ["Nice try", 1000], ["How about no?", 1550], [`Don't even try it ${msg.author.username}`, 3000]];
					var [no, time] = nope[Math.floor(Math.random() * nope.length)];
					msg.channel.startTyping();
					setTimeout(() => {
						msg.channel.send(no).then(() => msg.channel.stopTyping());
					}, time)
				}
			}
		}
	}
}
