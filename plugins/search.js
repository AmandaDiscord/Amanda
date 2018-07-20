const rp = require("request-promise");

module.exports = function(passthrough) {
	const { Discord, client } = passthrough;
	return {
		"urban": {
			usage: "<search term>",
			description: "Searches the urban dictionary for a term",
			aliases: ["urban", "define"],
			category: "search",
			process: async function(msg, suffix) {
				let req = undefined;
				if (msg.channel.type == "dm") req = true;
				else if (msg.channel.nsfw) req = true;
				else req = false;
				if (!req) return msg.channel.send(`Due to abuse and bot listing rules, this command is only allowed in nsfw channels`);
				let body = await rp(`http://api.urbandictionary.com/v0/define?term=${suffix}`);
				try {
					let data = JSON.parse(body);
					if (data.result_type == "no_results") return msg.channel.send(`${msg.author.username}, those are invalid search terms`);
					const embed = new Discord.RichEmbed()
						.setAuthor(data.list[0].word || suffix)
						.addField("Definition:", (data.list[0].definition || "Not available").slice(0, 1024))
						.addField("Example:", (data.list[0].example || "Not available").slice(0, 1024))
						.setColor("36393E");
					msg.channel.send({embed})
				} catch (error) {
					return msg.channel.send(`Error while requesting the definition\n${error}`);
				}
			}
		}
	}
}
