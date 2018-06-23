// const Canvas = require("canvas");
const util = require("util");
const fs = require("fs");
const crypto = require("crypto");
const request = require("request");
const Canvas = "";

module.exports = function(passthrough) {
	const {Discord, djs, dio, utils} = passthrough;
	return {
		"hug": {
			usage: "<user>",
			description: "Hugs someone",
			aliases: ["hug"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("Why would you want to hug someone in DMs?");
				var member = utils.findMember(msg, suffix);
				if (member == null) return msg.channel.send("Couldn't find that user");
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to hug`);
				if (member.user.id == msg.author.id) return msg.channel.send("That's not strange at all...");
				if (member.user.id == djs.user.id) return msg.channel.send(`**Hugs ${msg.author.username} back** :heart:`);
				request("http://api.shodanbot.com/interactions/hug", function(err, res, body) {
					if (err) return msg.channel.send("Error... Api returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`There was an error:\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setDescription(`${msg.author.username} hugged <@${member.user.id}>`)
						.setImage(data.img)
						.setColor("36393E");
					msg.channel.send({embed});
				})
			}
		},

		"kiss": {
			usage: "<user>",
			description: "Kisses someone",
			aliases: ["kiss"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("Why would you want to kiss someone in DMs?");
				var member = utils.findMember(msg, suffix);
				if (member == null) return msg.channel.send("Couldn't find that user");
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to kiss`);
				if (member.user.id == msg.author.id) return msg.channel.send(`W-What? Why, ${msg.author.username}?`);
				if (member.user.id == djs.user.id) return msg.channel.send(`**Kisses ${msg.author.username} back** :heart:`);
				request("http://api.shodanbot.com/interactions/kiss", function(err, res, body) {
					if (err) return msg.channel.send("Error... Api returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`There was an error:\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setDescription(`${msg.author.username} kissed <@${member.user.id}>`)
						.setImage(data.img)
						.setColor("36393E");
					msg.channel.send({embed});
				})
			}
		},

		"cuddle": {
			usage: "<user>",
			description: "Cuddles someone",
			aliases: ["cuddle"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("Why would you want to cuddle someone in DMs?");
				var member = utils.findMember(msg, suffix);
				if (member == null) return msg.channel.send("Couldn't find that user");
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to cuddle`);
				if (member.user.id == msg.author.id) return msg.channel.send("I find it strange that you tried to do that...");
				if (member.user.id == djs.user.id) return msg.channel.send(`**Cuddles ${msg.author.username} back** :heart:`);
				request("http://api.shodanbot.com/interactions/cuddle", function(err, res, body) {
					if (err) return msg.channel.send("Error... Api returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`There was an error:\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setDescription(`${msg.author.username} cuddled <@${member.user.id}>`)
						.setImage(data.img)
						.setColor("36393E");
					msg.channel.send({embed});
				})
			}
		},

		"poke": {
			usage: "<user>",
			description: "Pokes someone",
			aliases: ["poke"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("Why would you want to poke someone in DMs?");
				var member = utils.findMember(msg, suffix);
				if (member == null) return msg.channel.send("Couldn't find that user");
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to poke`);
				if (member.user.id == msg.author.id) return msg.channel.send("Ok then...");
				if (member.user.id == djs.user.id) return msg.channel.send(`Don't poke me ; ^ ;`);
				request("http://api.shodanbot.com/interactions/poke", function(err, res, body) {
					if (err) return msg.channel.send("Error... Api returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`There was an error:\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setDescription(`${msg.author.username} poked <@${member.user.id}>`)
						.setImage(data.img)
						.setColor("36393E");
					msg.channel.send({embed});
				})
			}
		},

		"slap": {
			usage: "<user>",
			description: "Slaps someone",
			aliases: ["slap"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("Why would you want to slap someone in DMs?");
				var member = utils.findMember(msg, suffix);
				if (member == null) return msg.channel.send("Couldn't find that user");
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to slap`);
				if (member.user.id == msg.author.id) return msg.channel.send("Come on... Don't make yourself look like an idiot...");
				if (member.user.id == djs.user.id) return msg.channel.send(`**Slaps ${msg.author.username} back** That hurt me\n; ^ ;`);
				request("http://api.shodanbot.com/interactions/slap", function(err, res, body) {
					if (err) return msg.channel.send("Error... Api returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`There was an error:\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setDescription(`${msg.author.username} slapped <@${member.user.id}>`)
						.setImage(data.img)
						.setColor("36393E");
					msg.channel.send({embed});
				})
			}
		},

		"boop": {
			usage: "<user>",
			description: "Boops someone",
			aliases: ["boop"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("Why would you want to boop someone in DMs?");
				var member = utils.findMember(msg, suffix);
				if (member == null) return msg.channel.send("Couldn't find that user");
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to boop`);
				if (member.user.id == msg.author.id) return msg.channel.send("Why even try?");
				if (member.user.id == djs.user.id) return msg.channel.send(`Dun boop me ; ^ ;`);
				request("http://api.shodanbot.com/interactions/boop", function(err, res, body) {
					if (err) return msg.channel.send("Error... Api returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`There was an error:\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setDescription(`${msg.author.username} booped <@${member.user.id}>`)
						.setImage(data.img)
						.setColor("36393E");
					msg.channel.send({embed});
				})
			}
		},

		"pat": {
			usage: "<user>",
			description: "Pats someone",
			aliases: ["pat"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("Why would you want to pat someone in DMs?");
				var member = utils.findMember(msg, suffix);
				if (member == null) return msg.channel.send("Couldn't find that user");
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to pat`);
				if (member.user.id == msg.author.id) return msg.channel.send("<:NotLikeCat:411364955493761044>");
				if (member.user.id == djs.user.id) return msg.channel.send(`≥ w ≤`);
				request("http://api.shodanbot.com/interactions/pat", function(err, res, body) {
					if (err) return msg.channel.send("Error... Api returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`There was an error:\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setDescription(`${msg.author.username} patted <@${member.user.id}>`)
						.setImage(data.img)
						.setColor("36393E");
					msg.channel.send({embed});
				})
			}
		},

		"stab": {
			usage: "<user>",
			description: "Stabs someone",
			aliases: ["stab"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("Why would you want to stab someone in DMs?");
				var member = utils.findMember(msg, suffix);
				if (member == null) return msg.channel.send("Couldn't find that user");
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to stab`);
				if (member.user.id == msg.author.id) return msg.channel.send("Oh...");
				if (member.user.id == djs.user.id) return msg.channel.send(`<:rip:401656884525793291>`);
				const embed = new Discord.RichEmbed()
					.setDescription(`${msg.author.username} stabbed <@${member.user.id}>`)
					.setColor("36393E");
				msg.channel.send({embed});
			}
		},

		"nom": {
			usage: "<user>",
			description: "noms someone",
			aliases: ["nom"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("Why would you want to nom someone in DMs?");
				var member = utils.findMember(msg, suffix);
				if (member == null) return msg.channel.send("Couldn't find that user");
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to nom`);
				if (member.user.id == msg.author.id) return msg.channel.send("You are so weird...");
				if (member.user.id == djs.user.id) return msg.channel.send(`owie`);
				request("http://api.shodanbot.com/interactions/nom", function(err, res, body) {
					if (err) return msg.channel.send("Error... Api returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`There was an error:\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setDescription(`${msg.author.username} nommed <@${member.user.id}>`)
						.setImage(data.img)
						.setColor("36393E");
					msg.channel.send({embed});
				})
			}
		},

		"ship": {
			usage: "<mention 1> <mention 2>",
			description: "Ships two people",
			aliases: ["ship"],
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				return msg.channel.send(`Due to deprecation, this feature is being reworked`);
				var args = suffix.split(" ");
				if (args.length != 2) return msg.channel.send(`You need to provide two users as arguments`);
				let members = [];
				let mentions = msg.mentions.members.array();
				members = args.map(arg => {
					if (arg.match(/^<@!?\d+>$/)) return mentions.pop();
					else return utils.findMember(msg, arg);
				});
				if (members.every(m => m.id == members[0].id)) return msg.channel.send(`You can't ship someone with themselves, silly`);
				msg.channel.startTyping();
				let canvas = new Canvas.createCanvas(300, 100);
				let ctx = canvas.getContext("2d");
				let pfpurls = members.map(m => {
					return (m.user.avatar)?`https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=128`: m.user.defaultAvatarURL
				});
				Promise.all(pfpurls.map(p => new Promise(resolve => request(p, {encoding: null}, (e,r,b) => resolve(b)))).concat([
					util.promisify(fs.readFile)("./images/emojis/heart.png", { encoding: null }),
					util.promisify(fs.readFile)("./images/300x100.png", { encoding: null })
				])).then(async ([avatar1, avatar2, emoji, template]) => {
					let templateI = new Canvas.Image();
					templateI.src = template;
					ctx.drawImage(templateI, 0, 0, 300, 100);
					let avatarI = new Canvas.Image();
					avatarI.src = avatar1;
					ctx.drawImage(avatarI, 0, 0, 100, 100);
					let emojiI = new Canvas.Image();
					emojiI.src = emoji;
					ctx.drawImage(emojiI, 110, 10, 80, 80);
					let avatarII = new Canvas.Image();
					avatarII.src = avatar2;
					ctx.drawImage(avatarII, 200, 0, 100, 100);
					let buffer = canvas.toBuffer();
					let strings = [members[0].id, members[1].id].sort((a,b) => parseInt(a)-parseInt(b)).join(" ");
					let percentage = undefined;
					if (strings == "320067006521147393 405208699313848330") percentage = 100;
					else {
						let hash = crypto.createHash("sha256").update(strings).digest("hex").slice(0, 6);
						percentage = parseInt("0x"+hash)%101;
					}
					await msg.channel.send(`Aww. I'd rate ${members[0].user.tag} and ${members[1].user.tag} being together a ${percentage}%`,{files: [buffer]});
					msg.channel.stopTyping();
				});
			}
		},

		"bean": {
			usage: "<user>",
			description: "Beans a user",
			aliases: ["bean"],
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("You can't bean someone in DMs, silly");
				if (!suffix) return msg.channel.send(`You have to tell me someone to bean!`);
				let user, member;
				if (msg.channel.type == "text") {
					member = utils.findMember(msg, suffix, true);
					if (member) user = member.user;
				} else {
					user = utils.findUser(msg, djs, suffix, true);
				}
				if (!user) return msg.channel.send(`Couldn't find that user`);
				if (user.id == djs.user.id) return msg.channel.send(`No u`);
				if (user.id == msg.author.id) return msg.channel.send(`You can't bean yourself, silly`);
				msg.channel.send(`**${user.tag}** has been banned!`);
			}
		}
	}
}
