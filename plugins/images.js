const request = require("request");

module.exports = function(passthrough) {
	const {Discord, djs, dio} = passthrough;
	return {
		"cat": {
			usage: "",
			description: "Returns an image of a cute cat",
			aliases: ["cat"],
			process: function(msg, suffix){
				request("https://api.cheweybot.ga/cat", function(err, res, body) {
					if (err) return msg.channel.send(`Error... API returned nothing`);
					try {
						var data = JSON.parse(body);
					} catch (error) {
							return msg.channel.send(`Uh oh. There was an error while requesting an image of a cat...\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.cheweybot.ga")
					msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => nmsg.edit({embed}));
				});
			}
		},

		"dog": {
			usage: "",
			description: "Returns an image of a cute doggo",
			aliases: ["dog", "doggo"],
			process: function(msg, suffix){
				request("https://api.thedogapi.co.uk/v2/dog.php", function(err, res, body) {
					if (err) return msg.channel.send("Error. The API returned nothing...");
					try {
						var data = JSON.parse(body);
					} catch (error) {
						return msg.channel.send(`Error while requesting an image of a dog.\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(`${data.data[0].url}`)
						.setColor('36393E')
					msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => nmsg.edit({embed})).catch(() => msg.channel.send("There was an error while fetching a doggo..."))
				});
			}
		},

		"space": {
			usage: "",
			description: "Returns an image of space",
			aliases: ["space"],
			process: function(msg, suffix) {
				request("https://api.cheweybot.ga/space", function(err, res, body) {
					if (err) return msg.channel.send("Error... API returned nothing");
					try {
						var data = JSON.parse(body);
					} catch (error) {
							return msg.channel.send(`Error while requesting a space image\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data.data)
						.setColor('36393E')
						.setFooter("Powered by api.cheweybot.ga")
					msg.channel.send("<a:SpaceLoading:429061691633041419>").then(nmsg => nmsg.edit({embed}))
				})
			}
		},

		"meme": {
			usage: "",
			description: "Gives a random meme",
			aliases: ["meme"],
			process: async function(msg, suffix) {
				var array = ["dankmemes", "meirl", "2meirl4meirl", "animemes", "sbubby", "fellowkids", "bertstrips", "hmmm", "2healthbars", "coaxedintoasnafu", "bossfight"];
				var choice = array[Math.floor(Math.random() * array.length)];
				request({ url: `https://api.reddit.com/r/${choice}/random`, headers: { "User-Agent": "Amanda" } }, function(err, res, body) {
					if (err) return msg.channel.send(`There was an error:\n${err}`);
					try {
						var data = JSON.parse(body);
					} catch (error) {
							return msg.channel.send(`Error while requesting a meme\n${error}`);
					}
					const embed = new Discord.RichEmbed()
						.setImage(data[0].data.children[0].data.preview?data[0].data.children[0].data.preview.images[0].source.url: "https://www.funpedia.net/imgs/may11/creative-404-not-found-pages-01.jpg")
						.setColor('36393E')
						.setFooter(`r/${choice}`)
					msg.channel.send({embed});
				});
			}
		}
	}
}
