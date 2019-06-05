const dailyCooldownHours = 20;
const dailyCooldownTime = dailyCooldownHours*60*60*1000;
const Jimp = require("jimp");
const Discord = require("discord.js");
require("../types.js");

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { client, utils } = passthrough;

	return {
		"slot": {
			usage: "<amount>",
			description: "Runs a random slot machine for a chance at Discoins",
			aliases: ["slot", "slots"],
			category: "gambling",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(client.lang.command.guildOnly(msg));
				let money = await utils.coinsManager.get(msg.author.id);
				msg.channel.sendTyping();
				let args = suffix.split(" ");
				let array = ['apple', 'cherries', 'watermelon', 'pear', "strawberry"]; // plus heart, which is chosen seperately
				const cooldownInfo = {
					max: 23,
					min: 10,
					step: 1,
					regen: {
						amount: 1,
						time: 3*60*1000
					}
				};
				let winChance = await utils.cooldownManager(msg.author.id, "slot", cooldownInfo);
				let slots = [];
				for (let i = 0; i < 3; i++) {
					if (Math.random() < winChance/100) {
						slots[i] = "heart";
					} else {
						slots[i] = array[Math.floor(Math.random() * array.length)];
					}
				}
				let font = await Jimp.loadFont(".fonts/Whitney-20.fnt");
				let canvas = await Jimp.read("./images/slot.png");
				let piece1 = await Jimp.read(`./images/emojis/${slots[0]}.png`);
				let piece2 = await Jimp.read(`./images/emojis/${slots[1]}.png`);
				let piece3 = await Jimp.read(`./images/emojis/${slots[2]}.png`);
				await piece1.resize(85, 85);
				await piece2.resize(85, 85);
				await piece3.resize(85, 85);

				await canvas.composite(piece1, 120, 360);
				await canvas.composite(piece2, 258, 360);
				await canvas.composite(piece3, 392, 360);

				let buffer, image;
				if (!args[0]) {
					await canvas.print(font, 130, 523, "Nothing");
					await canvas.print(font, 405, 523, "Nothing");
					buffer = await canvas.getBufferAsync(Jimp.MIME_PNG);
					image = new Discord.Attachment(buffer, "slot.png");
					return msg.channel.send({ files: [image] });
				}
				let bet;
				if (args[0] == "all") {
					if (money == 0) return msg.channel.send(client.lang.external.money.insufficient(msg));
					bet = money;
				} else {
					if (isNaN(args[0])) return msg.channel.send(client.lang.input.invalid(msg, "bet"));
					bet = Math.floor(parseInt(args[0]));
					if (bet < 2) return msg.channel.send(client.lang.input.money.small(msg, "bet", 2));
					if (bet > money) return msg.channel.send(client.lang.external.money.insufficient(msg));
				}
				let result = "";
				let winning;
				if (slots.every(s => s == "heart")) {
					winning = bet * 30;
					result += `WOAH! Triple :heart: You won ${bet * 30} ${client.lang.emoji.discoin}`;
				} else if (slots.filter(s => s == "heart").length == 2) {
					winning = bet * 4;
					result += `Wow! Double :heart: You won ${bet * 4} ${client.lang.emoji.discoin}`;
				} else if (slots.filter(s => s == "heart").length == 1) {
					winning = Math.floor(bet * 1.25);
					result += `A single :heart: You won ${Math.floor(bet * 1.25)} ${client.lang.emoji.discoin}`;
				} else if (slots.slice(1).every(s => s == slots[0])) {
					winning = bet * 10;
					result += `A triple. You won ${bet * 10} ${client.lang.emoji.discoin}`;
				} else {
					winning = 0;
					result += `Sorry. You didn't get a match. You lost ${bet} ${client.lang.emoji.discoin}`;
				}
				utils.coinsManager.award(msg.author.id, winning-bet);
				await canvas.print(font, 115, 523, winning);
				await canvas.print(font, 390, 523, bet);
				buffer = await canvas.getBufferAsync(Jimp.MIME_PNG);
				image = new Discord.Attachment(buffer, "slot.png");
				return msg.channel.send(result, {files: [image]});
			}
		},

		"flip": {
			usage: "none",
			description: "Flips a coin",
			aliases: ["flip"],
			category: "gambling",
			/**
			 * @param {Discord.Message} msg
			 */
			process: function(msg) {
				let array = ['heads <:coinH:402219464348925954>', 'tails <:coinT:402219471693021196>'];
				let flip = array[Math.floor(Math.random() * array.length)];
				return msg.channel.send(`You flipped ${flip}`);
			}
		},

		"betflip": {
			usage: "<amount> <side (h or t)>",
			description: "Place a bet on a random flip for a chance of Discoins",
			aliases: ["betflip", "bf"],
			category: "gambling",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(client.lang.command.guildOnly(msg));
				let args = suffix.split(" ");
				let money = await utils.coinsManager.get(msg.author.id);
				if (!args[0]) return msg.channel.send(`${msg.author.username}, you need to provide a bet and a side to bet on`);
				if (args[0] == "h" || args[0] == "t") {
					let t = args[0];
					args[0] = args[1];
					args[1] = t;
				}
				let bet;
				if (args[0] == "all") {
					if (money == 0) return msg.channel.send(client.lang.external.money.insufficient(msg));
					bet = money;
				} else {
					if (isNaN(args[0])) return msg.channel.send(client.lang.input.invalid(msg, "bet"));
					bet = Math.floor(parseInt(args[0]));
					if (bet < 1) return msg.channel.send(client.lang.input.money.small(msg, "bet", 1));
					if (bet > money) return msg.channel.send(client.lang.external.money.insufficient(msg));
				}
				let selfChosenSide = false;
				if (!args[1]) {
					args[1] = Math.random() < 0.5 ? "h" : "t";
					selfChosenSide = true;
				}
				if (args[1] != "h" && args[1] != "t") return msg.channel.send(`${msg.author.username}, that's not a valid side to bet on`);
				const cooldownInfo = {
					max: 60,
					min: 36,
					step: 3,
					regen: {
						amount: 1,
						time: 60*1000
					}
				};
				let winChance = await utils.cooldownManager(msg.author.id, "bf", cooldownInfo);
				const strings = {
					h: ["heads", "<:coinH:402219464348925954>"],
					t: ["tails", "<:coinT:402219471693021196>"]
				};
				if (Math.random() < winChance/100) {
					msg.channel.send(
						(!selfChosenSide ? "" : "You didn't choose a side, so I picked one for you: "+strings[args[1]][0]+".\n")+
						`You guessed ${strings[args[1]][0]}.\n${strings[args[1]][1]} I flipped ${strings[args[1]][0]}.\nYou guessed it! You got ${bet * 2} ${client.lang.emoji.discoin}`
					);
					utils.coinsManager.award(msg.author.id, bet);
				} else {
					let pick = args[1] == "h" ? "t" : "h";
					msg.channel.send(
						(!selfChosenSide ? "" : "You didn't choose a side, so I picked one for you: "+strings[args[1]][0]+".\n")+
						`You guessed ${strings[args[1]][0]}.\n${strings[pick][1]} I flipped ${strings[pick][0]}.\nSorry but you didn't guess correctly. Better luck next time.`
					);
					return utils.coinsManager.award(msg.author.id, -bet);
				}
			}
		},

		"coins": {
			usage: "<user>",
			description: "Returns the amount of Discoins you or another user has",
			aliases: ["coins", "$"],
			category: "gambling",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(client.lang.command.guildOnly(msg));
				let member = await msg.guild.findMember(msg, suffix, true);
				if (member == null) return msg.channel.send(client.lang.input.invalid(msg, "user"));
				let money = await utils.coinsManager.get(member.id);
				let embed = new Discord.RichEmbed()
					.setAuthor(`Coins for ${member.displayTag}`)
					.setDescription(`${money} Discoins ${client.lang.emoji.discoin}`)
					.setColor("F8E71C")
				return msg.channel.send({embed});
			}
		},

		"daily": {
			usage: "none",
			description: "A daily command that gives a random amount of Discoins",
			aliases: ["daily"],
			category: "gambling",
			/**
			 * @param {Discord.Message} msg
			 */
			process: async function(msg) {
				if (msg.channel.type == "dm") return msg.channel.send(client.lang.command.guildOnly(msg));
				let row = await utils.sql.get("SELECT lastClaim FROM DailyCooldown WHERE userID = ?", msg.author.id);
				if (!row || row.lastClaim+dailyCooldownTime < Date.now()) {
					let amount = Math.floor(Math.random() * (500 - 100) + 100);
					let embed = new Discord.RichEmbed()
						.setDescription(client.lang.external.money.dailyClaimed(msg, amount, dailyCooldownHours+" hours"))
						.setColor("F8E71C")
					msg.channel.send(embed);
					utils.coinsManager.award(msg.author.id, amount);
					utils.sql.all("REPLACE INTO DailyCooldown VALUES (?, ?)", [msg.author.id, Date.now()]);
				} else {
					let timeRemaining = (row.lastClaim-Date.now()+dailyCooldownTime).humanize("ms");
					msg.channel.send(client.lang.external.money.dailyCooldown(msg, timeRemaining));
				}
			}
		},

		"leaderboard": {
			usage: "none",
			description: "Gets the leaderboard for people with the most coins",
			aliases: ["leaderboard", "lb"],
			category: "gambling",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function(msg, suffix) {
				let pagesize = 10;
				let pagenum = 1;
				if (suffix) {
					let inputnum = parseInt(suffix);
					inputnum = Math.min(Math.max(inputnum, 1), 50);
					if (!isNaN(inputnum)) pagenum = inputnum;
				}
				let offset = (pagenum-1)*pagesize;
				let all = await utils.sql.all("SELECT userID, coins FROM money WHERE userID != ? ORDER BY coins DESC LIMIT ? OFFSET ?", [client.user.id, pagesize, offset]);
				let embed = new Discord.RichEmbed()
				.setAuthor("Leaderboard")
				.setDescription(all.map((row, index) => {
					let ranking = (index+offset+1)+". ";
					let user = client.users.get(row.userID);
					let displayTag = user ? user.tag : row.userID;
					let botTag = user && user.bot ? client.lang.emoji.bot : "";
					return `${ranking} ${displayTag} ${botTag} :: ${row.coins} ${client.lang.emoji.discoin}`;
				}))
				.setFooter(`Page ${pagenum}`)
				.setColor("F8E71C")
				return msg.channel.send({embed});
			}
		},

		"give": {
			usage: "<amount> <user>",
			description: "Gives discoins to a user from your account",
			aliases: ["give"],
			category: "gambling",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(client.lang.command.guildOnly(msg));
				let args = suffix.split(" ");
				if (!args[0]) return msg.channel.send(`${msg.author.username}, you have to provide an amount to give and then a user`);
				let usertxt = suffix.slice(args[0].length + 1);
				if (!usertxt) return msg.channel.send(client.lang.input.invalid(msg, "user"));
				let member = await msg.guild.findMember(msg, usertxt);
				if (member == null) return msg.channel.send(client.lang.input.invalid(msg, "user"));
				if (member.user.id == msg.author.id) return msg.channel.send(`You can't give coins to yourself, silly`);
				let authorCoins = await utils.coinsManager.get(msg.author.id);
				let gift;
				if (args[0] == "all") {
					if (authorCoins == 0) return msg.channel.send(client.lang.external.money.insufficient(msg));
					gift = authorCoins;
				} else {
					gift = Math.floor(parseInt(args[0]));
					if (isNaN(gift)) return msg.channel.send(client.lang.input.invalid(msg, "gift"));
					if (gift < 1) return msg.channel.send(client.lang.input.money.small(msg, "gift", 1));
					if (gift > authorCoins) return msg.channel.send(client.lang.external.money.insufficient(msg));
				}
				utils.coinsManager.award(msg.author.id, -gift);
				utils.coinsManager.award(member.id, gift);
				let embed = new Discord.RichEmbed()
					.setDescription(`${String(msg.author)} has given ${gift} Discoins to ${String(member)}`)
					.setColor("F8E71C")
				msg.channel.send({embed});
				return member.send(`${String(msg.author)} has given you ${gift} ${client.lang.emoji.discoin}`).catch(() => msg.channel.send(client.lang.permissionOtherDMBlocked(msg)));
			}
		}
	}
}
