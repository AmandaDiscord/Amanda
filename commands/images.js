let rp = require("request-promise");

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
				msg.channel.send("<a:CatLoading:426263491385622539>").then(async nmsg => {
					let body = await rp(`https://api.chewey-bot.ga/cat?auth=${key}`);
					let data;
					try {
						data = JSON.parse(body);
					} catch (error) { return nmsg.edit(utils.lang.apiImageError(error)); }
					let embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					return nmsg.edit({embed});
				});
			}
		},

		"dog": {
			usage: "none",
			description: "Returns an image of a cute doggo",
			aliases: ["dog", "doggo"],
			category: "images",
			process: function(msg) {
				msg.channel.send("<a:CatLoading:426263491385622539>").then(async nmsg => {
					let body = await rp(`https://api.chewey-bot.ga/dog?auth=${key}`);
					let data;
					try {
						data = JSON.parse(body);
					} catch (error) { return nmsg.edit(utils.lang.apiImageError(error)); }
					let embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					return nmsg.edit({embed});
				});
			}
		},

		"space": {
			usage: "none",
			description: "Returns an image of space",
			aliases: ["space"],
			category: "images",
			process: function(msg) {
				msg.channel.send("<a:SpaceLoading:429061691633041419>").then(async nmsg => {
					let body = await rp(`https://api.chewey-bot.ga/space?auth=${key}`);
					let data;
					try {
						data = JSON.parse(body);
					} catch (error) { return nmsg.edit(utils.lang.apiImageError(error)); }
					let embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.chewey-bot.ga")
					return nmsg.edit({embed});
				});
			}
		},

		"snek": {
			usage: "none",
			description: "Returns an image of a snek",
			aliases: ["snek", "snake"],
			category: "images",
			process: async function(msg) {
				let body = await rp(`https://api.chewey-bot.ga/snake?auth=${key}`);
				let data;
				try {
					data = JSON.parse(body);
				} catch (error) { return msg.channel.send(utils.lang.apiImageError(error)); }
				let embed = new Discord.RichEmbed()
					.setImage(data.data)
					.setColor('36393E')
					.setFooter("Powered by api.chewey-bot.ga")
				return msg.channel.send({embed});
			}
		},

		"birb": {
			usage: "none",
			description: "Returns an image of a birb",
			aliases: ["birb", "bird"],
			category: "images",
			process: async function(msg) {
				let body = await rp(`https://api.chewey-bot.ga/birb?auth=${key}`);
				let data;
				try {
					data = JSON.parse(body);
				} catch (error) { return msg.channel.send(utils.lang.apiImageError(error)); }
				let embed = new Discord.RichEmbed()
					.setImage(data.data)
					.setColor('36393E')
					.setFooter("Powered by api.chewey-bot.ga")
				return msg.channel.send({embed});
			}
		},

		"neko": {
			usage: "none",
			description: "Returns an image of a neko (ฅ’ω’ฅ)",
			aliases: ["neko"],
			category: "images",
			process: function(msg) {
				msg.channel.send("<a:NekoSway:461420549990776832>").then(async nmsg => {
					let body = await rp("https://nekos.life/api/v2/img/neko");
					let data;
					try {
						data = JSON.parse(body);
					} catch (error) { return nmsg.edit(utils.lang.apiImageError(error)); }
					let embed = new Discord.RichEmbed()
						.setImage(data.url)
						.setColor('36393E')
						.setFooter("Powered by nekos.life")
					return nmsg.edit({embed});
				});
			}
		}
	}
}
