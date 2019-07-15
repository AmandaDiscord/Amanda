const Discord = require("discord.js");
const path = require("path");

require("../types.js");

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { config, client, commands, db, reloader, reloadEvent, reactionMenus, queueManager, gameManager } = passthrough;

	let utils = require("../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../modules/lang.js")(passthrough);
	reloader.useSync("./modules/utilities.js", lang);

	let common = require("./music/common.js")(passthrough);
	reloader.useSync("./commands/music/common.js", common);

	Object.assign(commands, {
		"evaluate": {
			usage: "<code>",
			description: "Executes arbitrary JavaScript in the bot process. Requires bot owner permissions",
			aliases: ["evaluate", "eval"],
			category: "admin",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function (msg, suffix) {
				let allowed = await utils.hasPermission(msg.author, "eval");
				if (allowed) {
					if (!suffix) return msg.channel.send(`You didn't provide any input to evaluate, silly`);
					let result;
					let depth = suffix.split("--depth:")[1]
					depth?depth=depth.substring().split(" ")[0]:undefined;
					if (!depth) depth = 0;
					else {
						depth = Math.floor(Number(depth));
						if (isNaN(depth)) depth = 0;
						suffix = suffix.replace(`--depth:${suffix.split("--depth:")[1].substring().split(" ")[0]}`, "");
					}
					try {
						result = eval(suffix.replace(/client.token/g, `"${config.fake_token}"`));
					} catch (e) {
						result = e;
					}
					let output = await utils.stringify(result, depth);
					let nmsg = await msg.channel.send(output.replace(new RegExp(config.bot_token, "g"), "No"));
					let menu = nmsg.reactionMenu([{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }]);
					return setTimeout(() => menu.destroy(true), 5*60*1000);
				} else return;
			}
		},
		"execute": {
			usage: "<code>",
			description: "Executes a shell operation",
			aliases: ["execute", "exec"],
			category: "admin",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function (msg, suffix) {
				let allowed = await utils.hasPermission(msg.author, "eval");
				if (!allowed) return;
				if (!suffix) return msg.channel.send("You didn't provide anything to execute, silly");
				await msg.channel.sendTyping();
				require("child_process").exec(suffix, async (error, stdout, stderr) => {
					let result = "Output too large";
					if (error) result = error;
					else if (stdout) result = stdout;
					else if (stderr) result = stderr;
					else result = "No output";
					result = result.toString("utf8");
					if (result.length >= 2000) result = result.slice(0, 1995)+"…";
					let nmsg = await msg.channel.send(`\`\`\`\n${result}\n\`\`\``);
					let menu = nmsg.reactionMenu([{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }]);
					return setTimeout(() => menu.destroy(true), 5*60*1000);
				});
			}
		},
		"award": {
			usage: "<amount> <user>",
			description: "Awards a specific user ",
			aliases: ["award"],
			category: "admin",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function(msg, suffix) {
				let allowed = await utils.hasPermission(msg.author, "eval");
				if (!allowed) return msg.channel.sendNopeMessage();
				if (msg.channel.type == "dm") return msg.channel.send(lang.command.guildOnly(msg));
				let args = suffix.split(" ");
				if (!args[0]) return msg.channel.send(lang.input.invalid(msg, "amount to award"));
				let award = Math.floor(Number(args[0]));
				if (isNaN(award)) return msg.channel.send(lang.input.invalid(msg, "amount to award"));
				let usertxt = suffix.slice(args[0].length + 1);
				if (!usertxt) return msg.channel.send(lang.input.invalid(msg, "user"));
				let member = await msg.guild.findMember(msg, usertxt);
				if (!member) return msg.channel.send(lang.input.invalid(msg, "user"));
				utils.coinsManager.award(member.id, award);
				let embed = new Discord.RichEmbed()
					.setDescription(`**${String(msg.author)}** has awarded ${award} Discoins to **${String(member)}**`)
					.setColor("F8E71C")
				msg.channel.send({embed});
				return member.send(`**${String(msg.author)}** has awarded you ${award} ${lang.emoji.discoin}`).catch(() => msg.channel.send("I tried to DM that member but they may have DMs disabled from me"));
			}
		}
	});
}
