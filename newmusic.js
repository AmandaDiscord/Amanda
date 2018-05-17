const ytdl = require("ytdl-core");
const queues = {};
function newQueue(msg) {
  var id = msg.guild.id;
  return {
    guildID: id,
    songs: []
  }
}
function play(msg, connection, queue) {
  var dispatcher = connection.playStream(ytdl(queue[0]));
  dispatcher.on("end", () => {
    if (queue.length < 1) return msg.channel.send(`We've ran out of songs!`);
    return "end";
  });
  dispatcher.on("error", reason => {
    console.error(reason);
    return "error";
  })
}

module.exports = function(passthrough) {
  const { Discord, djs, dio } = passthrough;
  return {
    "music": {
      usage: "",
      description: "",
      process: async function(msg, suffix) {
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
          if (!args[1]) {
            if (queues[msg.guild.id].songs.length > 0) {
              while(queues[msg.guild.id].songs.length > 0) {
                play(msg, connection, queues[msg.guild.id].songs);
                queues[msg.guild.id].songs.shift();
                const embed = new Discord.RichEmbed()
                  .setDescription(`Playing <${queues[msg.guild.id].songs[0]}>`)
                msg.channel.send({embed});
              }
            } else return msg.channel.send(`${msg.author.username}, there aren't any songs in the queue to play`)
          }
          queues[msg.guild.id]
          
        }
      }
    }
  }
}
