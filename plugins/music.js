const ytdl = require("ytdl-core");

const queues = {};
function newQueue(msg) {
	var id = msg.guild.id;
	return {
		guild: id,
		songs: []
	}
}

module.exports = function(passthrough) {
  const { Discord, djs, dio } = passthrough;
  return {
    "music": {
      usage: "",
      description: "",
      process: async function(msg, suffix) {
				var nope = [["no", 300], ["Nice try", 1000], ["How about no?", 1550], [`Don't even try it ${msg.author.username}`, 3000]];
	      var [no, time] = nope[Math.floor(Math.random() * nope.length)];
				if(!["320067006521147393"].includes(msg.author.id)) {
					msg.channel.startTyping();
        setTimeout(() => {
          msg.channel.send(no).then(() => msg.channel.stopTyping());
        }, time)
				}
				if (msg.channel.type != "text") return msg.channel.send(`${msg.author.username}, you cannot use this command in DMs`);
				var args = suffix.split(" ");
				if (args[0].toLowerCase() == "play") {
					const voiceChannel = msg.member.voiceChannel;
					if (!voiceChannel) return msg.channel.send(`${msg.author.username}, you are not currently in a voice channel`);
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(`${msg.author.username}, I don't have permissions to connect to that voice channel`);
					if (!permissions.has("SPEAK")) return msg.channel.send(`${msg.author.username}, I don't have permissions to speak in that voice channel`);
					try {
						var connection = await voiceChannel.join();
					} catch (error) {
						console.error(error);
						return msg.channel.send(`${msg.author.username}, I could not join the voice channel`);
					}
					var id = msg.guild.id;
					if (!queues[id]) {
						queues[id] = newQueue(msg);
					}
					if (!args[1]) {
						if (!queues[id].songs[0]) return msg.channel.send(`${msg.author.username}, there are no songs in the queue`);
					}
					queues[id].songs.push(args[1]);
					const addembed = new Discord.RichEmbed()
						.setDescription(`${msg.author.username}, I've added the song to the queue`)
					msg.channel.send({addembed});
					const dispatcher = connection.playStream(ytdl(queues[id].songs[0]));
					dispatcher.on("end", () => {
						queues[id].songs = queues[id].songs.shift()
						if (!queues[id].songs[0]) {
							delete queues[id];
							return msg.channel.send(`We've run out of songs`);
						} else connection.playStream(ytdl(queues[id].songs[0]));
					})
					dispatcher.on("error", reason => {
						delete queues[id];
						console.error(error);
						return msg.channel.send(`Uhh. Hate to say this now but, there was an error with the dispatcher:\n\`\`\`js\n${reason}\n\`\`\` `);
					});
				} else if (args[0].toLowerCase() == "join") {
					const voiceChannel = msg.member.voiceChannel;
					if (!voiceChannel) return msg.channel.send(`${msg.author.username}, you are not currently in a voice channel`);
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(`${msg.author.username}, I don't have permissions to connect to that voice channel`);
					if (!permissions.has("SPEAK")) return msg.channel.send(`${msg.author.username}, I don't have permissions to speak in that voice channel`);
					try {
						voiceChannel.join();
					} catch (reason) {
						console.error(reason);
						return msg.channel.send(`I couldn't join the channel for whatever reason:\n\`\`\`js\n${reason}\n\`\`\``);
					}
					const joinembed = new Discord.RichEmbed()
						.setDescription(`Successfully joined ${voiceChannel.name}`)
					msg.channel.send({joinembed});
				} else if (args[0].toLowerCase() == "leave") {
					const voiceChannel = msg.member.voiceChannel;
					if (!voiceChannel) return msg.channel.send(`${msg.author.username}, you are not currently in a voice channel`);
					try {
						voiceChannel.leave();
					} catch (reason) {
						console.error(reason);
						return msg.channel.send(`I couldn't leave the channel for whatever reason:\n\`\`\`js\n${reason}\n\`\`\``);
					}
					const leaveembed = new Discord.RichEmbed()
						.setDescription(`Successfully left ${voiceChannel.name}`)
					msg.channel.send({leaveembed});
				} else return msg.channel.send(`${msg.author.username}, That's not a valid action to do`);
      }
    }
  }
}
