const ytdl = require("ytdl-core");
const Discord = require("discord.js");

const queues = new Map();
const timeout = new Set();

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const queue = queues.get(msg.guild.id);
	const song = {
		title: Discord.Util.escapeMarkdown(video.title),
		url: video.video_url
	};
	if (!queue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queues.set(msg.guild.id, queueConstruct);
		if (timeout.has(msg.guild.id)) return;
		queueConstruct.songs.push(song);
		timeout.add(msg.guild.id);
		setTimeout(() => timeout.delete(msg.guild.id), 1000)
		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg, msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			queues.delete(msg.guild.id);
			return msg.channel.send(`I could not join the voice channel: ${error}`);
		}
	} else {
		if (timeout.has(msg.guild.id)) return;
		queue.songs.push(song);
		timeout.add(msg.guild.id);
		setTimeout(() => timeout.delete(msg.guild.id), 1000)
		if (playlist) return;
		else return msg.react("👌");
	}
}

function play(msg, guild, song) {
	const queue = queues.get(guild.id);
	if (!song) {
		queue.voiceChannel.leave();
		queues.delete(guild.id);
		return msg.channel.send(`We've run out of songs`)
	}
	const dispatcher = queue.connection.playStream(ytdl(song.url))
	.on('end', reason => {
		queue.songs.shift();
		play(msg, guild, queue.songs[0]);
	})
	.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(queue.volume / 5);
	const embed = new Discord.RichEmbed()
	.setDescription(`Now playing: ${song.title}`);
	msg.channel.send({embed});
}

module.exports = function(passthrough) {
	const { Discord, djs, dio } = passthrough;
	return {
		"music": {
			usage: "Null",
			description: "See `&commands music` for help",
			process: async function(msg, suffix) {
				if (msg.channel.type != "text") return msg.channel.send(`${msg.author.username}, you cannot use this command in DMs`);
				if(["434187284477116426", "400034967322624020", "399054909695328277", "357272833824522250", "223247740346302464"].includes(msg.guild.id)) {
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
					const video = await ytdl.getInfo(args[1]);
					return handleVideo(video, msg, voiceChannel);
				} else if (args[0].toLowerCase() == "stop") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send('There is nothing playing to stop');
					queue.songs = [];
					return queue.connection.dispatcher.end();
				} else if (args[0].toLowerCase() == "queue") {
					if (!queue) return msg.channel.send(`There aren't any songs queued`);
					let index = 0;
					const embed = new Discord.RichEmbed()
					.setAuthor(`Queue for ${msg.guild.name}`)
					.setDescription(queue.songs.map(songss => `${++index}. **${songss.title}**`).join('\n'))
					return msg.channel.send({embed});
				} else if (args[0].toLowerCase() == "skip") {
					if (!voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send(`There aren't any songs to skip`);
					await queue.connection.dispatcher.end();
					return msg.react("👌");
				} else if (args[0].toLowerCase() == "volume") {
					if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel');
					if (!queue) return msg.channel.send('There is nothing playing.');
					if (!args[1]) return msg.channel.send(`The current volume is: **${queue.volume}**`);
					queue.volume = args[1];
					queue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
					return msg.react("👌");
				} else if (args[0].toLowerCase() == "now") {
					if (!queue) return msg.channel.send('There is nothing playing.');
					const embed = new Discord.RichEmbed()
					.setDescription(`Currently playing song: **${queue.songs[0].title}**`)
					return msg.channel.send({embed});
				} else return msg.channel.send(`${msg.author.username}, That's not a valid action to do`);
			}
		}
	}
}
