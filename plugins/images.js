const request = require("request");

module.exports = function(passthrough) {
	const { Discord, client } = passthrough;
	return {
		"cat": {
			usage: "",
			description: "Returns an image of a cute cat",
			aliases: ["cat"],
			category: "images",
			process: function(msg) {
				request("https://api.chewey-bot.ga/cat", function(err, res, body) {
					if (err) return msg.channel.send(`Error... API returned nothing`);
					try {
						var data = JSON.parse(body);
					} catch (error) {
							return msg.channel.send(`Uh oh. There was an error while requesting an image of a cat...\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => nmsg.edit({embed}));
				});
			}
		},

		"dog": {
			usage: "",
			description: "Returns an image of a cute doggo",
			aliases: ["dog", "doggo"],
			category: "images",
			process: function(msg) {
				request("https://api.chewey-bot.ga/dog", function(err, res, body) {
					if (err) return msg.channel.send("Error. The API returned nothing...");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`Error while requesting an image of a dog.\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => nmsg.edit({embed}));
				});
			}
		},

		"space": {
			usage: "",
			description: "Returns an image of space",
			aliases: ["space"],
			category: "images",
			process: function(msg) {
				request("https://api.chewey-bot.ga/space", function(err, res, body) {
					if (err) return msg.channel.send("Error... API returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
							return msg.channel.send(`Error while requesting a space image\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					msg.channel.send("<a:SpaceLoading:429061691633041419>").then(nmsg => nmsg.edit({embed}))
				})
			}
		},

		"meme": {
			usage: "",
			description: "Returns a meme",
			aliases: ["meme"],
			category: "images",
			process: async function(msg) {
				var array = ["dankmemes", "meirl", "2meirl4meirl", "animemes", "sbubby", "fellowkids", "bertstrips", "2healthbars", "coaxedintoasnafu", "bossfight"];
				var choice = array[Math.floor(Math.random() * array.length)];
				request({ url: `https://api.reddit.com/r/${choice}/random`, headers: { "User-Agent": "Amanda" } }, function(err, res, body) {
					if (err) return msg.channel.send(`There was an error:\n${err}`);
					try {
						var data = JSON.parse(body);
					} catch (error) {
							return msg.channel.send(`Error while requesting a meme\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data[0].data.children[0].data.preview?data[0].data.children[0].data.preview.images[0].source.url: "https://i2.wp.com/www.funnygrins.com/main/wp-content/uploads/2011/03/404Death.png")
						.setColor('36393E')
						.setFooter(`r/${choice}`)
					msg.channel.send({embed});
				});
			}
		},

		"snek": {
			usage: "",
			description: "Returns an image of a snek",
			aliases: ["snek", "snake"],
			category: "images",
			process: function(msg) {
				request("https://api.chewey-bot.ga/snake", function(err, res, body) {
					if (err) return msg.channel.send(`There was an error:\n${err}`);
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`Error while requesting an image of a snek\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					msg.channel.send({embed});
				});
			}
		},

		"birb": {
			usage: "",
			description: "Returns an image of a birb",
			aliases: ["birb", "bird"],
			category: "images",
			process: function(msg) {
				request("https://api.chewey-bot.ga/birb", function(err, res, body) {
					if (err) return msg.channel.send(`There was an error:\n${err}`);
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`Error while requesting an image of a snek\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					msg.channel.send({embed});
				});
			}
		},

		"neko": {
			usage: "",
			description: "Returns an image of a neko (ฅ’ω’ฅ)",
			aliases: ["neko"],
			category: "images",
			process: function(msg) {
				request("https://nekos.life/api/v2/img/neko", function(err, res, body) {
					if (err) return msg.channel.send(`There was an error:\n${err}`);
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`Error while requesting an image of a neko\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data.url)
						.setColor('36393E')
						.setFooter("Powered by nekos.life")
					msg.channel.send({embed});
				});
			}
		}
	}
}
