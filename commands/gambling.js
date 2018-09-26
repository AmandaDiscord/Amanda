let mined = new Set();
let fs = require("fs");
let Canvas = require("canvas-prebuilt");
let util = require("util");

module.exports = function(passthrough) {
	let { Discord, client, utils } = passthrough;

	return {
		"slot": {
			usage: "<amount>",
			description: "Runs a random slot machine for a chance at Discoins",
			aliases: ["slot", "slots"],
			category: "gambling",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				let money = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				if (!money) {
					await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
					money = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				msg.channel.sendTyping();
				let args = suffix.split(" ");
				let array = ['apple', 'cherries', 'watermelon', 'pear', 'heart', "strawberry"];
				let slot1 = array[Math.floor(Math.random() * array.length)];
				let slot2 = array[Math.floor(Math.random() * array.length)];
				let slot3 = array[Math.floor(Math.random() * array.length)];
				let canvas = new Canvas(601, 600);
				let ctx = canvas.getContext("2d");
				Promise.all([
					util.promisify(fs.readFile)(`./images/emojis/${slot1}.png`),
					util.promisify(fs.readFile)(`./images/emojis/${slot2}.png`),
					util.promisify(fs.readFile)(`./images/emojis/${slot3}.png`),
					util.promisify(fs.readFile)(`./images/slot.png`)
				]).then(async ([image1, image2, image3, template]) => {
					let templateI = new Canvas.Image();
					templateI.src = template;
					ctx.drawImage(templateI, 0, 0, 601, 600);
					let imageI = new Canvas.Image();
					imageI.src = image1;
					ctx.drawImage(imageI, 120, 360, 85, 85); // 91, 320
					let imageII = new Canvas.Image();
					imageII.src = image2;
					ctx.drawImage(imageII, 258, 360, 85, 85);
					let imageIII = new Canvas.Image();
					imageIII.src = image3;
					ctx.drawImage(imageIII, 392, 360, 85, 85);
					ctx.font = "20px 'Whitney'";
					ctx.fillStyle = "white";
					let buffer;
					if (!args[0]) {
						ctx.fillText("Nothing", 130, 540);
						ctx.fillText("Nothing", 405, 540 );
						buffer = canvas.toBuffer();
						return msg.channel.send({files: [buffer]});
					}
					let bet;
					if (args[0] == "all") {
						if (money.coins == 0) return msg.channel.send(`${msg.author.username}, you don't have any <a:Discoin:422523472128901140> to bet with!`);
						bet = money.coins;
					} else {
						if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid bet`);
						bet = Math.floor(parseInt(args[0]));
						if (bet < 2) return msg.channel.send(`${msg.author.username}, you cannot make a bet less than 2`);
						if (bet > money.coins) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that bet`);
					}
					let result = `**${msg.author.tag}**, `;
					let winning;
					if (slot1 == "heart" && slot1 == slot2 && slot2 == slot3) {
						winning = bet * 30;
						result += `WOAH! Triple :heart: You won ${bet * 30} <a:Discoin:422523472128901140>`;
						utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + (bet * 29), msg.author.id]);
					} else if (slot1 == "heart" && slot1 == slot2 || slot1 == "heart" && slot1 == slot3) {
						winning = bet * 4;
						result += `Wow! Double :heart: You won ${bet * 4} <a:Discoin:422523472128901140>`;
						utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + (bet * 3), msg.author.id]);
					} else if (slot2 == "heart" && slot2 == slot3) {
						winning = bet * 4;
						result += `Wow! Double :heart: You won ${bet * 4} <a:Discoin:422523472128901140>`;
						utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + (bet * 3), msg.author.id]);
					} else if (slot1 == "heart" || slot2 == "heart" || slot3 == "heart") {
						winning = Math.floor(bet * 1.25);
						result += `A single :heart: You won ${Math.floor(bet * 1.25)} <a:Discoin:422523472128901140>`;
						utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + (Math.floor(bet * 0.25)), msg.author.id]);
					} else if (slot1 == slot2 && slot2 == slot3) {
						winning = bet * 10;
						result += `A triple. You won ${bet * 10} <a:Discoin:422523472128901140>`;
						utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + (bet * 9), msg.author.id]);
					} else {
						winning = "Nothing";
						result += `Sorry. You didn't get a match. You lost ${bet} <a:Discoin:422523472128901140>`;
						utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [money.coins - bet, msg.author.id]);
					}
					ctx.fillText(winning, 115, 540);
					ctx.fillText(bet, 390, 540 );
					buffer = canvas.toBuffer();
					msg.channel.send(result, {files: [buffer]});
				});
			}
		},

		"flip": {
			usage: "none",
			description: "Flips a coin",
			aliases: ["flip"],
			category: "gambling",
			process: function(msg, suffix) {
				let array = ['heads <:coinH:402219464348925954>', 'tails <:coinT:402219471693021196>'];
				let flip = array[Math.floor(Math.random() * array.length)];
				msg.channel.send(`You flipped ${flip}`);
			}
		},

		"betflip": {
			usage: "<amount> <side (h or t)>",
			description: "Place a bet on a random flip for a chance of Discoins",
			aliases: ["betflip", "bf"],
			category: "gambling",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				let args = suffix.split(" ");
				let money = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				if (!money) {
					await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
					money = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				if (!args[0]) return msg.channel.send(`${msg.author.username}, you need to provide a bet and a side to bet on`);
				let bet;
				if (args[0] == "all") {
					if (money.coins == 0) return msg.channel.send(`${msg.author.username}, you don't have any <a:Discoin:422523472128901140> to bet with!`);
					bet = money.coins;
				} else {
					if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid bet`);
					bet = Math.floor(parseInt(args[0]));
					if (bet < 1) return msg.channel.send(`${msg.author.username}, you cannot make a bet less than 1`);
					if (bet > money.coins) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that bet`);
				}
				if (!args[1]) return msg.channel.send(`${msg.author.username}, you need to provide a side to bet on. Valid sides are h or t`);
				if (args[1] != "h" && args[1] != "t") return msg.channel.send(`${msg.author.username}, that's not a valid side to bet on`);
				let flip = Math.floor(Math.random() * (4 - 1) + 1);
				if (args[1] == "h" && flip == 1 || args[1] == "t" && flip == 2) {
					msg.channel.send(`You guessed it! you got ${bet * 2} <a:Discoin:422523472128901140>`);
					return utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + bet, msg.author.id]);
				} else {
					msg.channel.send(`Sorry but you didn't guess correctly. Better luck next time`);
					return utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [money.coins - bet, msg.author.id]);
				}
			}
		},

		"coins": {
			usage: "<user>",
			description: "Returns the amount of Discoins you or another user has",
			aliases: ["coins", "$"],
			category: "gambling",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				let member = msg.guild.findMember(msg, suffix, true);
				if (member == null) return msg.channel.send(`Couldn't find that user`);
				let target = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				if (!target) {
					await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.user.id, 5000]);
					target = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				}
				let embed = new Discord.RichEmbed()
					.setAuthor(`Coins for ${member.user.tag}`)
					.setDescription(`${target.coins} Discoins <a:Discoin:422523472128901140>`)
					.setColor("F8E71C")
				msg.channel.send({embed});
			}
		},

		"mine": {
			usage: "none",
			description: "Mines for Discoins",
			aliases: ["mine"],
			category: "gambling",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				let money = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				if (!money) {
					await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
					money = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				if (mined.has(msg.author.id)) return msg.channel.send(`${msg.author.username}, you have already went mining within the past minute. Come back after it has been 1 minute.`);
				let mine = Math.floor(Math.random() * (100 - 1) + 1);
				let embed = new Discord.RichEmbed()
					.setDescription(`**${msg.author.username} went mining and got ${mine} <a:Discoin:422523472128901140> :pick:**`)
					.setColor("F8E71C")
				msg.channel.send({embed});
				utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [money.coins + mine, msg.author.id]);
				mined.add(msg.author.id);
				setTimeout(() => {
					mined.delete(msg.author.id);
				}, 60000);
			}
		},

		"leaderboard": {
			usage: "none",
			description: "Gets the leaderboard for people with the most coins",
			aliases: ["leaderboard", "lb"],
			category: "gambling",
			process: async function(msg, suffix) {
				let all = await utils.sql.all("SELECT * FROM money WHERE userID !=? ORDER BY coins DESC LIMIT 10", client.user.id);
				let embed = new Discord.RichEmbed()
					.setAuthor("Leaderboards")
					.setDescription(all.map((row, index) => `${index+1}. ${client.users.get(row.userID) ? client.users.get(row.userID).tag : row.userID} :: ${row.coins} <a:Discoin:422523472128901140>`).join("\n"))
					.setColor("F8E71C")
				msg.channel.send({embed});
			}
		},

		"give": {
			usage: "<amount> <user>",
			description: "Gives discoins to a user from your account",
			aliases: ["give"],
			category: "gambling",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				let args = suffix.split(" ");
				if (!args[0]) return msg.channel.send(`${msg.author.username}, you have to provide an amount to give and then a user`);
				let usertxt = suffix.slice(args[0].length + 1);
				if (!usertxt) return msg.channel.send(`${msg.author.username}, you need to provide a user to give to`);
				let member = msg.guild.findMember(msg, usertxt);
				if (member == null) return msg.channel.send("Could not find that user");
				if (member.user.id == msg.author.id) return msg.channel.send(`You can't give coins to yourself, silly`);
				let author = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				let target = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				if (!target) {
					await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.user.id, 5000]);
					target = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				}
				if (!author) {
					await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
					author = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				let gift;
				if (args[0] == "all") {
					if (author.coins == 0) return msg.channel.send(`${msg.author.username}, you don't have any <a:Discoin:422523472128901140> to give!`);
					gift = author.coins;
				} else {
					if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid amount to give`);
					gift = Math.floor(parseInt(args[0]));
					if (gift < 1) return msg.channel.send(`${msg.author.username}, you cannot give less than 1`);
					if (gift > author.coins) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that transaction`);
				}
				utils.sql.all(`UPDATE money SET coins =? WHERE userID=?`, [author.coins - gift, msg.author.id]);
				utils.sql.all(`UPDATE money SET coins =? WHERE userID=?`, [target.coins + gift, member.user.id]);
				let embed = new Discord.RichEmbed()
					.setDescription(`**${msg.author.tag}** has given ${gift} Discoins to **${member.user.tag}**`)
					.setColor("F8E71C")
				msg.channel.send({embed});
				member.send(`**${msg.author.tag}** has given you ${gift} <a:Discoin:422523472128901140>`).catch(() => msg.channel.send("I tried to DM that member but they may have DMs disabled from me"));
			}
		}
	}
}
