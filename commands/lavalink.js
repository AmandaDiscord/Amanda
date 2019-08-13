const fetch = require("node-fetch");
const url = require('url');

require("../types");

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { client, commands } = passthrough;

	async function llsearch(string) {
		const node = client.lavalink.nodes.first();

		const params = new URLSearchParams();
		params.append("identifier", string);

		return fetch(`http://${node.host}:${node.port}/loadtracks?${params.toString()}`, { headers:{Authorization: node.password}}).then(res => res.json()).then(data => data.tracks)
	}

	commands.assign({
		"lavalink": {
			usage: "<text>",
			description: "Lol k",
			aliases: ["lavalink", "ll"],
			category: "development",
			async process(msg, suffix) {
				if (msg.channel.type == "dm") return;
				if (msg.member.voice && !msg.member.voice.channel) return msg.channel.send("You have to be in a voice channel");

				let args = suffix.split(" ");
				let search = suffix.substring(args[0].length + 1);
				if (args[0] == "play") {
					if (!msg.member.voice.channel.joinable) return msg.channel.send("I can't join that channel lol");
					if (!msg.member.voice.channel.speakable) return msg.channel.send("I can't speak in that channel lol");
					if (!search) return msg.channel.send("You gotta gimme something to play. Lmao");
					let result = await llsearch(`${search}`);
					if (result.length < 1) return msg.channel.send("Nothing found lol");
					let player = await client.lavalink.join({
						guild: msg.guild.id,
						channel: msg.member.voice.channel.id,
						host: client.lavalink.nodes.first().host
					});
					player.play(result[0].track);
					msg.channel.send(`Now playing ${result[0].info.title}`);
					player.once("end", reason => {
						if (reason === "REPLACED") return;
						client.lavalink.leave(msg.guild.id);
					});
				}
			}
		}
	});
}