let request = require("request");

module.exports = function(passthrough) {
	let { Discord, config, client } = passthrough;
	let key = config.chewey_api_key;
	return {
		"cat": {
			usage: "none",
			description: "Returns an image of a cute cat",
			aliases: ["cat"],
			category: "images",
			process: function(msg) {
				msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => {
					request("https://api.chewey-bot.ga/cat?auth="+key, function(err, res, body) {
						if (err) return nmsg.edit(`Error... API returned nothing`);
						let data;
						try {
							data = JSON.parse(body);
						} catch (error) { return nmsg.edit(`Uh oh. There was an error while requesting an image of a cat...\n${error}`); }
						let embed = new Discord.RichEmbed()
							.setImage(data.data)
							.setColor('36393E')
							.setFooter("Powered by api.chewey-bot.ga")
						return nmsg.edit({embed});
					});
				});
			}
		},

		"dog": {
			usage: "none",
			description: "Returns an image of a cute doggo",
			aliases: ["dog", "doggo"],
			category: "images",
			process: function(msg) {
				msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => {
					request("https://api.chewey-bot.ga/dog?auth="+key, function(err, res, body) {
						if (err) return nmsg.edit("Error. The API returned nothing...");
						let data;
						try {
							data = JSON.parse(body);
						} catch (error) { return nmsg.edit(`Error while requesting an image of a dog.\n${error}`); }
						let embed = new Discord.RichEmbed()
							.setImage(data.data)
							.setColor('36393E')
							.setFooter("Powered by api.chewey-bot.ga")
						return nmsg.edit({embed});
					});
				});
			}
		},

		"space": {
			usage: "none",
			description: "Returns an image of space",
			aliases: ["space"],
			category: "images",
			process: function(msg) {
				msg.channel.send("<a:SpaceLoading:429061691633041419>").then(nmsg => {
					request("https://api.chewey-bot.ga/space?auth="+key, function(err, res, body) {
						if (err) return nmsg.edit("Error... API returned nothing");
						let data;
						try {
							data = JSON.parse(body);
						} catch (error) { return nmsg.edit(`Error while requesting a space image\n${error}`); }
						let embed = new Discord.RichEmbed()
							.setImage(data.data)
							.setColor('36393E')
							.setFooter("Powered by api.chewey-bot.ga")
						return nmsg.edit({embed});
					});
				});
			}
		},

		"snek": {
			usage: "none",
			description: "Returns an image of a snek",
			aliases: ["snek", "snake"],
			category: "images",
			process: function(msg) {
				request("https://api.chewey-bot.ga/snake?auth="+key, function(err, res, body) {
					if (err) return msg.channel.send(`There was an error:\n${err}`);
					let data;
					try {
						data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`Error while requesting an image of a snek\n${error}`);
					}
					let embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					msg.channel.send({embed});
				});
			}
		},

		"birb": {
			usage: "none",
			description: "Returns an image of a birb",
			aliases: ["birb", "bird"],
			category: "images",
			process: function(msg) {
				request("https://api.chewey-bot.ga/birb?auth="+key, function(err, res, body) {
					if (err) return msg.channel.send(`There was an error:\n${err}`);
					let data;
					try {
						data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`Error while requesting an image of a snek\n${error}`);
					}
					let embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					msg.channel.send({embed});
				});
			}
		},

		"neko": {
			usage: "none",
			description: "Returns an image of a neko (ฅ’ω’ฅ)",
			aliases: ["neko"],
			category: "images",
			process: function(msg) {
				msg.channel.send("<a:NekoSway:461420549990776832>").then(nmsg => {
					request("https://nekos.life/api/v2/img/neko", function(err, res, body) {
						if (err) return nmsg.edit(`There was an error:\n${err}`);
						let data;
						try {
							data = JSON.parse(body);
						} catch (error) { return nmsg.edit(`Error while requesting an image of a neko\n${error}`); }
						let embed = new Discord.RichEmbed()
							.setImage(data.url)
							.setColor('36393E')
							.setFooter("Powered by nekos.life")
						return nmsg.edit({embed});
					});
				});
			}
		}
	}
}
