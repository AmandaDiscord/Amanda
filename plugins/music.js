const ytdl = require("ytdl-core");
const Discord = require("discord.js");

const queues = new Map();

async function play(msg, guild, song) {
	const queue = queues.get(guild.id);
	if (!queue) return;
	if (!song) {
		await queue.textchan.send(`We've run out of songs`);
		queues.delete(guild.id);
		return msg.member.voiceChannel.leave();
	}
	const dispatcher = queue.connection.playStream(ytdl(queue.songs[0].url));
	dispatcher.on("end", async () => {
		queue.songs.shift();
		play(msg, guild, queue.songs[0]);
	})
	dispatcher.on("error", reason => console.error(reason));
	dispatcher.setVolumeLogarithmic(queue.volume / 5);
	const embed = new Discord.RichEmbed()
		.setDescription(`Now playing: ${song.title}`);
	msg.channel.send({embed});
}

module.exports = function(passthrough) {
  const { Discord, djs, dio } = passthrough;
  return {
    "music": {
      usage: "",
      description: "",
      process: async function(msg, suffix) {
				if (msg.channel.type != "text") return msg.channel.send(`${msg.author.username}, you cannot use this command in DMs`);
				if(["434187284477116426", "400034967322624020", "399054909695328277", "357272833824522250"].includes(msg.guild.id)) {
					var isPrem = true;
				} else if (["320067006521147393", "366385096053358603", "176580265294954507"].includes(msg.author.id)) {
					var isPrem = true;
				} else {
					var isPrem = false;
				}
				if (isPrem == false) {
					msg.channel.startTyping();
        	return setTimeout(() => {
         		msg.channel.send(`${msg.author.username}, you or this guild is not apart of the patreon system. You can obtain information about upgrading via the \`&upgrade\` command`).then(() => msg.channel.stopTyping());
       	 	}, 2000)
				}
				var args = suffix.split(" ");
				const queue = queues.get(msg.guild.id);
				const voiceChannel = msg.member.voiceChannel;
				if (args[0].toLowerCase() == "play") {
					if (!voiceChannel) return msg.channel.send(`**${msg.author.username}**, you are currently not in a voice channel`);
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to connect to the voice cahnnel you are in`);
					if (!permissions.has("SPEAK")) return msg.channel.send(`**${msg.author.username}**, I don't have permissions to speak in that voice channel`);
					if (!args[1]) return msg.channel.send(`${msg.author.username}, you need to provide a valid youtube link as an argument to the play sub-command`);
					const songInfo = await ytdl.getInfo(args[1]);
					const song = {
						title: Discord.Util.escapeMarkdown(songInfo.title),
						url: songInfo.video_url
					}
					if (!queue) {
						const queueConstruct = {
							textchan: msg.channel,
							voiceChan: voiceChannel,
							connection: null,
							songs: [],
							volume: 5,
							playing: true
						}
						queues.set(msg.guild.id, queueConstruct);
						queueConstruct.songs.push(song);
						try {
							var connection = await voiceChannel.join();
							await voiceChannel.join();
							queueConstruct.connection = connection;
							await play(msg, msg.guild, queueConstruct.songs[0]);
							msg.react("👌");
						} catch (reason) {
							queues.delete(msg.guild.id);
							return msg.channel.send(`There was an error:\n${reason}`);
						}
					} else {
						queue.songs.push(song)
						msg.react("👌");
					}
				} else if (args[0].toLowerCase() == "join") {
					if (!voiceChannel) return msg.channel.send(`${msg.author.username}, you are not currently in a voice channel`);
					const permissions = voiceChannel.permissionsFor(msg.client.user);
					if (!permissions.has("CONNECT")) return msg.channel.send(`${msg.author.username}, I don't have permissions to connect to that voice channel`);
					if (!permissions.has("SPEAK")) return msg.channel.send(`${msg.author.username}, I don't have permissions to speak in that voice channel`);
					try {
						await voiceChannel.join();
						msg.react("👌");
					} catch (reason) {
						console.error(reason);
						return msg.channel.send(`There was an error:\n\`\`\`js\n${reason}\n\`\`\``);
					}
				} else if (args[0].toLowerCase() == "stop") {
					if (!voiceChannel) return msg.channel.send(`**${msg.author.username}**, you are currently not in a voice channel`);
					try {
						queues.delete(msg.guild.id);
						await voiceChannel.leave();
						msg.react("👌");
					} catch (reason) {
						msg.channel.send(`There was an error:\n\`\`\`js\n${reason}\n\`\`\``);
					}
				} else if (args[0].toLowerCase() == "queue") {
					if (!queue) return msg.channel.send(`There aren't any songs queued`);
					let index = 0;
					const embed = new Discord.RichEmbed()
						.setAuthor(`Queue for ${msg.guild.name}`)
						.setDescription(queue.songs.map(songss => `${++index}. **${songss.title}**`).join('\n'))
					msg.channel.send({embed});
				} else if (args[0].toLowerCase() == "skip") {
					if (!voiceChannel) return msg.channel.send('You are not in a voice channel!');
					if (!queue) return msg.channel.send(`There aren't any songs to skip`);
					await queue.connection.dispatcher.end('Skip command has been used!');
					return msg.react("👌");
				} else if (args[0].toLowerCase() == "remove") {

				} else return msg.channel.send(`${msg.author.username}, That's not a valid action to do`);
      }
    }
  }
}
