const Discord = require('discord.js');
const mined = new Set();
const fs = require("fs");
const Canvas = require("canvas-prebuilt");
const util = require("util");

module.exports = function(passthrough) {
	const { Discord, djs, dio, utils } = passthrough;

	async function getWaifuInfo(userID) {
		let [meRow, claimerRow] = await Promise.all([
			utils.get("SELECT waifuID FROM waifu WHERE userID = ?", userID),
			utils.get("SELECT userID, price FROM waifu WHERE waifuID = ?", userID)
		]);
		let claimer = claimerRow ? dio.users[claimerRow.userID] : undefined;
		let price = claimerRow ? Math.floor(claimerRow.price * 1.25) : 0;
		let waifu = meRow ? dio.users[meRow.waifuID] : undefined;
		return {claimer, price, waifu};
	}

	return {
		"dice": {
			usage: "",
			description: "Rolls two six sided die",
			aliases: ["dice"],
			process: function(msg, suffix) {
				msg.channel.send(`You rolled a ${Math.floor(Math.random() * (6 - 1) + 1)} and a ${Math.floor(Math.random() * (6 - 1) + 1)}`);
			}
		},

		"slot": {
			usage: "<bet>",
			description: "Runs a random slot machine for a chance at Discoins",
			aliases: ["slot", "slots"],
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				var money = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				if (!money) {
					await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
					await msg.channel.send(`Created user account`);
					var money = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				var args = suffix.split(" ");
				var array = ['apple', 'cherries', 'watermelon', 'pear', 'heart', "strawberry"];
				var slot1 = array[Math.floor(Math.random() * array.length)];
				var slot2 = array[Math.floor(Math.random() * array.length)];
				var slot3 = array[Math.floor(Math.random() * array.length)];
				let canvas = new Canvas.createCanvas(553, 552);
				let ctx = canvas.getContext("2d");
				Promise.all([
					util.promisify(fs.readFile)(`./images/emojis/${slot1}.png`),
					util.promisify(fs.readFile)(`./images/emojis/${slot2}.png`),
					util.promisify(fs.readFile)(`./images/emojis/${slot3}.png`),
					util.promisify(fs.readFile)(`./images/slot.png`)
				]).then(async ([image1, image2, image3, template]) => {
					let templateI = new Canvas.Image();
					templateI.src = template;
					ctx.drawImage(templateI, 0, 0, 553, 552);
					let imageI = new Canvas.Image();
					imageI.src = image1;
					ctx.drawImage(imageI, 91, 320, 85, 85);
					let imageII = new Canvas.Image();
					imageII.src = image2;
					ctx.drawImage(imageII, 234, 320, 85, 85);
					let imageIII = new Canvas.Image();
					imageIII.src = image3;
					ctx.drawImage(imageIII, 376, 320, 85, 85);
					let buffer = canvas.toBuffer();

					if (!args[0]) {
						await msg.channel.send({files: [buffer]});
						return msg.channel.stopTyping();
					}
					if (args[0] == "all") {
						if (money.coins == 0) return msg.channel.send(`${msg.author.username}, you don't have any <a:Discoin:422523472128901140> to bet with!`);
						var bet = money.coins;
					} else {
						if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid bet`);
						var bet = Math.floor(parseInt(args[0]));
						if (bet < 1) return msg.channel.send(`${msg.author.username}, you cannot make a bet less than 1`);
						if (bet > money.coins) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that bet`);
					}
					msg.channel.startTyping();
					var result = `**${msg.author.tag}**, `;
					if (slot1 == "heart" && slot1 == slot2 && slot2 == slot3) {
						result += `WOAH! Triple :heart: You won ${bet * 30} <a:Discoin:422523472128901140>`;
						utils.sql(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + (bet * 29), msg.author.id]);
					} else if (slot1 == "heart" && slot1 == slot2 || slot1 == "heart" && slot1 == slot3) {
						result += `Wow! Double :heart: You won ${bet * 4} <a:Discoin:422523472128901140>`;
						utils.sql(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + (bet * 3), msg.author.id]);
					} else if (slot2 == "heart" && slot2 == slot3) {
						result += `Wow! Double :heart: You won ${bet * 4} <a:Discoin:422523472128901140>`;
						utils.sql(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + (bet * 3), msg.author.id]);
					} else if (slot1 == "heart" || slot2 == "heart" || slot3 == "heart") {
						result += `A single :heart: You won your bet back`;
					} else if (slot1 == slot2 && slot2 == slot3) {
						result += `A triple. You won ${bet * 10} <a:Discoin:422523472128901140>`;
						utils.sql(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + (bet * 9), msg.author.id]);
					} else {
						result += `Sorry. You didn't get a match. You lost ${bet} <a:Discoin:422523472128901140>`;
						utils.sql(`UPDATE money SET coins =? WHERE userID =?`, [money.coins - bet, msg.author.id]);
					}
					await msg.channel.send(result, {files: [buffer]});
					msg.channel.stopTyping();
				})
			}
		},

		"flip": {
			usage: "",
			description: "Flips a coin",
			aliases: ["flip"],
			process: function(msg, suffix) {
				var array = ['heads <:coinH:402219464348925954>', 'tails <:coinT:402219471693021196>'];
				var flip = array[Math.floor(Math.random() * array.length)];
				msg.channel.send(`You flipped ${flip}`);
			}
		},

		"betflip": {
			usage: "<bet> <side (h or t)>",
			description: "Place a bet on a random flip for a chance of Discoins",
			aliases: ["betflip", "bf"],
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				var args = suffix.split(" ");
				var money = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				if (!money) {
					await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
					await msg.channel.send(`Created user account`);
					var money = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				if (!args[0]) return msg.channel.send(`${msg.author.username}, you need to provide a bet and a side to bet on`);
				if (args[0] == "all") {
					if (money.coins == 0) return msg.channel.send(`${msg.author.username}, you don't have any <a:Discoin:422523472128901140> to bet with!`);
					var bet = money.coins;
				} else {
					if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid bet`);
					var bet = Math.floor(parseInt(args[0]));
					if (bet < 1) return msg.channel.send(`${msg.author.username}, you cannot make a bet less than 1`);
					if (bet > money.coins) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that bet`);
				}
				if (!args[1]) return msg.channel.send(`${msg.author.username}, you need to provide a side to bet on. Valid sides are h or t`);
				if (args[1] != "h" && args[1] != "t") return msg.channel.send(`${msg.author.username}, that's not a valid side to bet on`);
				var flip = Math.floor(Math.random() * (4 - 1) + 1);
				if (args[1] == "h" && flip == 1 || args[1] == "t" && flip == 2) {
					msg.channel.send(`You guessed it! you got ${bet * 2} <a:Discoin:422523472128901140>`);
					return utils.sql(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + bet, msg.author.id]);
				} else {
					msg.channel.send(`Sorry but you didn't guess correctly. Better luck next time`);
					return utils.sql(`UPDATE money SET coins =? WHERE userID =?`, [money.coins - bet, msg.author.id]);
				}
			}
		},

		"coins": {
			usage: "<user>",
			description: "Returns the amount of Discoins you or another user has",
			aliases: ["coins", "$"],
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				var member = utils.findMember(msg, suffix, true);
				if (member == null) return msg.channel.send(`Couldn't find that user`);
				var target = await utils.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				if (!target) {
					await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.user.id, 5000]);
					await msg.channel.send(`Created user account`);
					var target = await utils.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				}
				const embed = new Discord.RichEmbed()
					.setAuthor(`Coins for ${member.user.tag}`)
					.setDescription(`${target.coins} Discoins <a:Discoin:422523472128901140>`)
					.setColor("F8E71C")
				msg.channel.send({embed});
			}
		},

		"mine": {
			usage: "",
			description: "Mines for Discoins",
			aliases: ["mine"],
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				var money = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				if (!money) {
					await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
					await msg.channel.send(`Created user account`);
					var money = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				if (mined.has(msg.author.id)) return msg.channel.send(`${msg.author.username}, you have already went mining within the past minute. Come back after it has been 1 minute.`);
				var mine = Math.floor(Math.random() * (100 - 1) + 1);
				const embed = new Discord.RichEmbed()
					.setDescription(`**${msg.author.username} went mining and got ${mine} <a:Discoin:422523472128901140> :pick:**`)
					.setColor("F8E71C")
				msg.channel.send({embed});
				utils.sql(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + mine, msg.author.id]);
				mined.add(msg.author.id);
				setTimeout(() => {
					mined.delete(msg.author.id);
				}, 60000);
			}
		},

		"leaderboard": {
			usage: "",
			description: "Gets the leaderboard for people with the most coins",
			aliases: ["leaderboard", "lb"],
			process: async function(msg, suffix) {
				var all = await utils.sql("SELECT * FROM money WHERE userID !=? ORDER BY coins DESC LIMIT 10", djs.user.id);
				let index = 0;
				const embed = new Discord.RichEmbed()
					.setAuthor("Leaderboards")
					.setDescription(all.map(row => `${++index}. ${dio.users[row.userID] ? dio.users[row.userID].username : row.userID} :: ${row.coins} <a:Discoin:422523472128901140>`).join("\n"))
					.setColor("F8E71C")
				msg.channel.send({embed});
			}
		},

		"give": {
			usage: "<amount> <user>",
			description: "Gives discoins to a user from your account",
			aliases: ["give", "gift"],
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				var args = suffix.split(" ");
				if (!args[0]) return msg.channel.send(`${msg.author.username}, you have to provide an amount to give and then a user`);
				var usertxt = suffix.slice(args[0].length + 1);
				if (!usertxt) return msg.channel.send(`${msg.author.username}, you need to provide a user to give to`);
				var member = utils.findMember(msg, usertxt);
				if (member == null) return msg.channel.send("Could not find that user");
				if (member.user.id == msg.author.id) return msg.channel.send(`You can't give coins to yourself, silly`);
				var author = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				var target = await utils.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				if (!target) {
					await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.user.id, 5000]);
					await msg.channel.send(`Created user account`);
					var target = await utils.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				}
				if (!author) {
					await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
					await msg.channel.send(`Created user account`);
					var author = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				if (args[0] == "all") {
					if (author.coins == 0) return msg.channel.send(`${msg.author.username}, you don't have any <a:Discoin:422523472128901140> to give!`);
					var gift = author.coins;
				} else {
					if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid amount to give`);
					var gift = Math.floor(parseInt(args[0]));
					if (gift < 1) return msg.channel.send(`${msg.author.username}, you cannot give less than 1`);
					if (gift > author.coins) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that transaction`);
				}
				utils.sql(`UPDATE money SET coins =? WHERE userID=?`, [author.coins - gift, msg.author.id]);
				utils.sql(`UPDATE money SET coins =? WHERE userID=?`, [target.coins + gift, member.user.id]);
				const embed = new Discord.RichEmbed()
					.setDescription(`**${msg.author.tag}** has given ${gift} Discoins to **${member.user.tag}**`)
					.setColor("F8E71C")
				msg.channel.send({embed});
				member.send(`**${msg.author.tag}** has given you ${gift} <a:Discoin:422523472128901140>`).catch(() => msg.channel.send("I tried to DM that member but they may have DMs disabled from me"));
			}
		},

		"award": {
			usage: "<amount> <user>",
			description: "Awards a specific user ",
			aliases: ["award"],
			process: async function(msg, suffix) {
				if (["320067006521147393"].includes(msg.author.id)) {
					if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
					var args = suffix.split(" ");
					if (!args[0]) return msg.channel.send(`${msg.author.username}, you have to provide an amount to award and then a user`);
					if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid amount to award`);
					if (args[0] < 1) return msg.channel.send(`${msg.author.username}, you cannot award an amount less than 1`);
					var usertxt = suffix.slice(args[0].length + 1);
					if (!usertxt) return msg.channel.send(`${msg.author.username}, you need to provide a user to award`);
					var member = utils.findMember(msg, usertxt);
					if (member == null) return msg.channel.send("Could not find that user");
					if (member.user.id == msg.author.id) return msg.channel.send(`You can't award yourself, silly`);
					var target = await utils.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
					if (!target) {
						await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.user.id, 5000]);
						await msg.channel.send(`Created user account`);
						var target = await utils.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
					}
					var award = parseInt(args[0]);
					var award = Math.floor(award);
					utils.sql(`UPDATE money SET coins =? WHERE userID=?`, [target.coins + award, member.user.id]);
					const embed = new Discord.RichEmbed()
						.setDescription(`**${msg.author.tag}** has awarded ${award} Discoins to **${member.user.tag}**`)
						.setColor("F8E71C")
					msg.channel.send({embed});
					member.send(`**${msg.author.tag}** has awarded you ${award} <a:Discoin:422523472128901140>`).catch(() => msg.channel.send("I tried to DM that member but they may have DMs disabled from me"));
				} else {
					utils.sendNopeMessage(msg);
				}
			}
		},

		"wheel": {
			usage: "<bet>",
			description: "Runs a random wheel for a chance at gaining discoins",
			aliases: ["wheel"],
			process: async function(msg, suffix) {
				var args = suffix.split(" ");
				var arrows = ["up", "down", "left", "right", "lower_left", "lower_right", "upper_left", "upper_right"];
				var choice = arrows[Math.floor(Math.random() * arrows.length)];
				var money = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				if (!money) {
					await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
					await msg.channel.send(`Created user account`);
					var money = await utils.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				msg.channel.send(`:arrow_${choice}:\nThere. This line was added. That means I did some work. Are you happy, suler?`);
			}
		},

		"waifu": {
			usage: "<user>",
			description: "Gets the waifu information about yourself or a user",
			aliases: ["waifu"],
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				var member = utils.findMember(msg, suffix, true);
				if (member == null) return msg.channel.send(`Couldn't find that user`);
				let info = await getWaifuInfo(member.user.id);
				const embed = new Discord.RichEmbed()
					.setAuthor(member.user.tag, member.user.avatarURL)
					.addField(`Price:`, info.price)
					.addField(`Claimed by:`, info.claimer ? info.claimer.username : "(nobody)")
					.addField(`Waifu:`, info.waifu ? info.waifu.username : "(nobody)")
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},

		"claim": {
			usage: "<price> <user>",
			description: "Claims someone as a waifu. Requires Discoins",
			aliases: ["claim"],
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				var args = suffix.split(" ");
				var usertxt = args.slice(1).join(" ");
				if (!usertxt) return msg.channel.send(`${msg.author.username}, you need to provide a member you would like to claim`);
				var member = utils.findMember(msg, usertxt);
				if (!member) return msg.channel.send(`Couldn't find that user`);
				let [memberInfo, myInfo, money] = await Promise.all([
					getWaifuInfo(member.user.id),
					getWaifuInfo(msg.author.id),
					utils.get("SELECT coins FROM money WHERE userID = ?", msg.author.id)
				]);
				money = money.coins;
				if (!money) {
					money = 5000;
					await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, money]);
				}
				let claim = 0;
				if (args[0] == "all") {
					if (!money) return msg.channel.send(`${msg.author.username}, you don't have any <a:Discoin:422523472128901140> to claim someone with!`);
					claim = money;
				} else {
					claim = Math.floor(parseInt(args[0]));
					if (isNaN(claim)) return msg.channel.send(`${msg.author.username}, that is not a valid amount to claim someone with`);
					if (claim < 1) return msg.channel.send(`${msg.author.username}, you cannot claim someone for less than 1 <a:Discoin:422523472128901140>`);
					if (claim > money) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that transaction`);
				}
				if (memberInfo.price > claim) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that transaction. You need ${memberInfo.price}`);
				if (memberInfo.claimer && memberInfo.claimer.id == msg.author.id) return msg.channel.send(`${msg.author.username}, you can't claim your waifu twice over, silly. You can \`&invest <amount> <user>\` into them, however`);
				await Promise.all([
					utils.sql("DELETE FROM waifu WHERE userID = ? OR waifuID = ?", [msg.author.id, member.user.id]),
					utils.sql(`UPDATE money SET coins =? WHERE userID =?`, [money - claim, msg.author.id])
				]);
				utils.sql("INSERT INTO waifu VALUES (?, ?, ?)", [msg.author.id, member.user.id, claim]);
				member.user.send(`**${msg.author.tag}** has claimed you for ${claim} <a:Discoin:422523472128901140>`).catch(() => msg.channel.send(`I tried to DM a **${member.user.tag}** about the transaction but they may have DMs from me disabled`));
				const embed = new Discord.RichEmbed()
					.setDescription(`**${msg.author.tag}** has claimed **${member.user.tag}** for ${claim}`)
				msg.channel.send({embed});
			}
		},

		"invest": {
			usage: "<amount> <user>",
			description: "Invests Discoins into your waifu",
			aliases: ["invest"],
			process: async function(msg, suffix) {
				var array = [["Soon", 500], ["It's almost here", 1200], ["Not too much longer of a wait", 2000]];
				var [soon, time] = array[Math.floor(Math.random() * array.length)];
				msg.channel.startTyping();
				setTimeout(() => {
					msg.channel.send(soon).then(() => msg.channel.stopTyping());
				}, time)
			}
		}
	}
}
