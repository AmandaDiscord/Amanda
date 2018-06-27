const fs = require("fs");
const os = require("os");
const util = require("util");
const { exec } = require("child_process");

module.exports = function(passthrough) {
	const { Auth, Discord, client, djs, dio, db, utils, commands } = passthrough;
	return {
		"uptime": {
			usage: "",
			description: "Returns the amount of time since the process has started",
			aliases: ["uptime"],
			category: "core",
			process: function(msg, suffix) {
				const embed = new Discord.RichEmbed()
					.setAuthor("Uptime")
					.addField("❯ Bot Uptime:", `${utils.humanize(process.uptime(), "sec")}`)
					.setFooter("And still going")
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},

		"statistics": {
			usage: "",
			description: "Displays detailed statistics",
			aliases: ["statistics", "stats"],
			category: "statistics",
			process: async function(msg, suffix) {
				var ramUsage = ((process.memoryUsage().heapUsed / 1024) / 1024).toFixed(2);
				let status = utils.getPresenceEmoji(djs.user.presence.status);
				let game = "No activity set";
				if (djs.user.presence.game && djs.user.presence.game.streaming) {
					 game = `Streaming [${djs.user.presence.game.name}](${djs.user.presence.game.url})`;
					 status = `<:streaming:454228675227942922>`;
				} else if (djs.user.presence.game) game = utils.getPresencePrefix(djs.user.presence.game.type)+" **"+djs.user.presence.game.name+"**";
				var nmsg = await msg.channel.send("Ugh. I hate it when I'm slow, too");
				const embed = new Discord.RichEmbed()
					.setAuthor("Statistics")
					.setTitle(`${djs.user.tag} ${status}`)
					.setDescription(game)
					.addField("❯ API Latency:", `${djs.ping.toFixed(0)}ms`, true)
					.addField("❯ User Count:", `${djs.users.size} users`, true)
					.addBlankField(true)
					.addField(`❯ Message Edit:`, `${nmsg.createdTimestamp - msg.createdTimestamp}ms`, true)
					.addField("❯ Guild Count:", `${djs.guilds.size} guilds`, true)
					.addBlankField(true)
					.addField("❯ Bot Uptime:", `${utils.humanize(process.uptime(), "sec")}`, true)
					.addField("❯ Channel Count:", `${djs.channels.size} channels`, true)
					.addBlankField(true)
					.addField("❯ RAM Usage:", `${ramUsage}MB`)
					.setFooter(`Requested by ${msg.author.username}`)
					.setColor("36393E")
				nmsg.edit({embed});
			}
		},

		"ping": {
			usage: "",
			description: "Gets latency to Discord",
			aliases: ["ping", "pong"],
			category: "statistics",
			process: async function (msg, suffix) {
				var array = ["So young... So damaged...", "We've all got no where to go...","You think you have time...", "Only answers to those who have known true despair...", "Hopeless...", "Only I know what will come tomorrow...", "So dark... So deep... The secrets that you keep...", "Truth is false...", "Despair..."];
				var message = array[Math.floor(Math.random() * array.length)];
				var footers = ["Is that slow?", "W-Wait... It's called table tennis"];
				var footer = footers[Math.floor(Math.random() * footers.length)];
				const embed = new Discord.RichEmbed()
					.setAuthor("Pong!")
					.addField("❯ API Latency:", `${djs.ping.toFixed(0)}ms`, true)
					.addField(`❯ Message Edit:`, `${Date.now() - msg.createdTimestamp}ms`, true)
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
			category: "core",
			process: function(msg, suffix) {
				const embed = new Discord.RichEmbed()
					.setDescription("**I've been invited?**\n*Be sure that you have administrator permissions on the server you would like to invite me to*")
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
			category: "core",
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
			category: "core",
			process: function(msg, suffix) {
				const embed = new Discord.RichEmbed()
					.setAuthor("Privacy")
					.setDescription("Amanda may collect basic user information. This data includes but is not limited to usernames, discriminators, profile pictures and user identifiers also known as snowflakes.This information is exchanged solely between services related to the improvement or running of Amanda and [Discord](https://discordapp.com/terms) it is not exchanged with any other providers. That's a promise. If you do not want your information to be used by the bot, remove it from your servers and do not use it")
					.setFooter("Amanda", djs.user.avatarURL)
					.setColor("36393E")
				msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
			}
		},

		"commands": {
			usage: "<category>",
			description: "Shows the command list from a specific category of commands",
			aliases: ["commands", "cmds"],
			category: "core",
			process: async function(msg, suffix) {
				if (!suffix) return msg.channel.send(`${msg.author.username}, you must provide a command category as an argument`);
				var cat = Object.values(commands).filter(c => c.category == suffix.toLowerCase());
				if (!cat || cat.toString().length < 1) {
					const embed = new Discord.RichEmbed()
						.setDescription(`**${msg.author.tag}**, It looks like there isn't anything here but the almighty hipnotoad`)
						.setColor('36393E')
					return msg.channel.send({embed});
				}
				var str = cat.map(c => `${c.aliases[0]} ${c.usage}    [${c.aliases.join(", ")}]`).join("\n");
				const embed = new Discord.RichEmbed()
					.setAuthor(`${suffix.toLowerCase()} command list`)
					.setTitle("command <usage>    [aliases]")
					.setDescription(str)
					.setColor("36393E")
				msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
			}
		},

		"help": {
			usage: "<command>",
			description: "Your average help command",
			aliases: ["help", "h"],
			category: "core",
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
						.setDescription(`❯ Core\n❯ Statistics\n❯ Gambling\n⮟ Server\n   Guild\n   Moderation\n   Interaction\n❯ Fun\n❯ Search\n❯ Images\n❯ Music\n\n:information_source: Typing \`&cmds <category>\` will display all commands in that category\nEx: \`&cmds core\``)
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
			category: "admin",
			process: async function (msg, suffix) {
				let allowed = await utils.hasPermission(msg.author, "eval");
				if (allowed) {
					let result;
					try {
						result = eval(suffix);
					} catch (e) {
						result = e;
					}
					let output = await utils.stringify(result);
					let nmsg = await msg.channel.send(output.replace(new RegExp(Auth.bot_token, "g"), "No")).catch(reason => msg.channel.send(`Uh oh. There was an error sending that message\n${reason}`));
					utils.reactionMenu(nmsg, [
						{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }
					]);
				} else {
					utils.sendNopeMessage(msg);
				}
			}
		}
	}
}
