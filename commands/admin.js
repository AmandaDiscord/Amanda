module.exports = function(passthrough) {
	let { Discord, client, db, utils, commands, config } = passthrough;

	return {
		"evaluate": {
			usage: "<code>",
			description: "Executes arbitrary JavaScript in the bot process. Requires bot owner permissions",
			aliases: ["evaluate", "eval"],
			category: "admin",
			process: async function (msg, suffix) {
				let allowed = await utils.hasPermission(msg.author, "eval");
				if (allowed) {
					if (!suffix) return msg.channel.send(`You didn't provide any input to evaluate, silly`);
					let result;
					let depth = suffix.split("--depth:")[1]
					if (!depth) {
						depth = 0;
					} else {
						depth = Math.floor(parseInt(depth));
						if (isNaN(depth)) depth = 0;
						suffix = suffix.split("--depth:")[0];
					}
					try {
						result = eval(suffix.replace(/client.token/g, `"${config.fake_token}"`));
					} catch (e) {
						result = e;
					}
					let output = await utils.stringify(result, depth);
					let nmsg = await msg.channel.send(output.replace(new RegExp(config.bot_token, "g"), "No"));
					let menu = nmsg.reactionMenu([{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }]);
					setTimeout(() => menu.destroy(true), 5*60*1000);
					return;
				} else return;
			}
		},

		"execute": {
			usage: "<code>",
			description: "Executes a shell operation",
			aliases: ["execute", "exec"],
			category: "admin",
			process: async function (msg, suffix) {
				let allowed = await utils.hasPermission(msg.author, "eval");
				if (!allowed) return;
				if (!suffix) return msg.channel.send("You didn't provide anything to execute, silly");
				await msg.channel.sendTyping();
				require("child_process").exec(suffix, async (error, stdout, stderr) => {
					let result = "Output too large";
					if (error) {
						if (error.toString("utf8").length >= 2000) result = error.toString("utf8").slice(0, 1998)+"…";
						else result = error;
					}
					if (stderr) {
						if (stderr.toString("utf8").length >= 2000) result = stderr.toString("utf8").slice(0, 1998)+"…";
						else result = stderr;
					}
					if (stdout) {
						if (stdout.toString("utf8").length >= 2000) result = stdout.toString("utf8").slice(0, 1998)+"…";
						else result = stdout;
					}
					let nmsg = await msg.channel.send(`\`\`\`\n${result}\n\`\`\``);
					let menu = nmsg.reactionMenu([{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }]);
					setTimeout(() => menu.destroy(true), 5*60*1000);
					return;
				});
			}
		},

		"award": {
			usage: "<amount> <user>",
			description: "Awards a specific user ",
			aliases: ["award"],
			category: "admin",
			process: async function(msg, suffix) {
				let allowed = await utils.hasPermission(msg.author, "eval");
				if (!allowed) return msg.channel.sendNopeMessage();
				if (msg.channel.type == "dm") return msg.channel.send(client.lang.command.guildOnly(msg));
				let args = suffix.split(" ");
				if (!args[0]) return msg.channel.send(client.lang.input.invalid(msg, "user"));
				if (isNaN(args[0])) return msg.channel.send(client.lang.input.invalid(msg, "amount to award"));
				let usertxt = suffix.slice(args[0].length + 1);
				if (!usertxt) return msg.channel.send(client.lang.input.invalid(msg, "user"));
				let member = await msg.guild.findMember(msg, usertxt);
				if (member == null) return msg.channel.send(client.lang.input.invalid(msg, "user"));
				let award = Math.floor(parseInt(args[0]));
				utils.coinsManager.award(member.id, award);
				let embed = new Discord.RichEmbed()
					.setDescription(`**${String(msg.author)}** has awarded ${award} Discoins to **${String(member)}**`)
					.setColor("F8E71C")
				msg.channel.send({embed});
				return member.send(`**${String(msg.author)}** has awarded you ${award} ${client.lang.emoji.discoin}`).catch(() => msg.channel.send("I tried to DM that member but they may have DMs disabled from me"));
			}
		}
	}
}
