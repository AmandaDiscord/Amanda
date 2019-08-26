//@ts-check

const Discord = require("discord.js")
const rp = require("request-promise")
const lavalink = require("discord.js-lavalink")

const passthrough = require("../../passthrough")
let { client, commands, reloader } = passthrough

let utils = require("../../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

let common = require("./common.js")
reloader.useSync("./commands/music/common.js", common)

/* commands.assign({
	"lavalink": {
		usage: "<text>",
		description: "Lol k",
		aliases: ["lavalink", "ll"],
		category: "development",
		async process(msg, suffix) {
			if (msg.channel.type == "dm") return
			if (msg.member.voice && !msg.member.voice.channel) return msg.channel.send("You have to be in a voice channel")
			if (!msg.member.voice.channel.joinable) return msg.channel.send("I can't join that channel lol")
			if (!msg.member.voice.channel.speakable) return msg.channel.send("I can't speak in that channel lol")

			let args = suffix.split(" ")
			let search = suffix.slice(args[0].length + 1)
			if (args[0] == "play") {
				if (!search) return msg.channel.send("You gotta gimme something to play. Lmao")
				let result = await getTracks(search)
				if (result.length < 1) return msg.channel.send("Nothing found lol")
				let queue = queueStore.getOrCreate(msg.member.voice.channel, msg.channel)
				let song = makeYouTubeSongFromData(result[0])
				queue.addSong(song)
			} else if (args[0] == "frisky") {
				let result = await getTracks("http://chill.friskyradio.com/friskychill_mp3_high")
				let song = new FriskySong("chill", result[0])
				let queue = queueStore.getOrCreate(msg.member.voice.channel, msg.channel)
				queue.addSong(song)
			} else if (args[0] == "stop") {
				let queue = queueStore.get(msg.guild.id)
				if (queue) {
					queue.stop()
				} else {
					msg.channel.send("nothing playing lol")
				}
			} else if (args[0] == "queue") {
				let queue = queueStore.get(msg.guild.id)
				if (queue) {
					let rows = queue.songs.map((song, index) => `${index+1}. `+song.queueLine)
					let totalLength = "\nTotal length: "+common.prettySeconds(queue.getTotalLength())
					let body = utils.compactRows.removeMiddle(rows, 2000-totalLength.length).join("\n") + totalLength
					msg.channel.send(
						new Discord.MessageEmbed()
						.setTitle(`Queue for ${Discord.Util.escapeMarkdown(msg.guild.name)}`)
						.setDescription(body)
						.setColor(0x36393f)
					)
				} else {
					msg.channel.send("nothing playing lol")
				}
			} else if (args[0] == "related") {
				let queue = queueStore.get(msg.guild.id)
				if (queue) {
					if (args[1] == "play") {
						let index = +args[2]
						queue.wrapper.playRelated(index, msg)
					} else {
						queue.wrapper.showRelated(msg.channel)
					}
				} else {
					msg.channel.send("nothing playing lol")
				}
			} else if (args[0] == "test") {
				let queue = queueStore.getOrCreate(msg.member.voice.channel, msg.channel)
				let results = await Promise.all([
					getTracks("wN9bXy_fiOE"),
					getTracks("PSfBqZ46NmE"),
					getTracks("fa2pWQlajSQ")
				])
				results.forEach(result => {
					let song = makeYouTubeSongFromData(result[0])
					queue.addSong(song)
				})
			} else if (args[0] == "xi") {
				let songs = await utils.sql.all("SELECT * FROM PlaylistSongs INNER JOIN Songs ON Songs.videoID = PlaylistSongs.videoID WHERE playlistID = 1");
				let orderedSongs = [];
				let song = songs.find(row => !songs.some(r => r.next == row.videoID));
				while (song) {
					orderedSongs.push(song);
					if (song.next) song = songs.find(row => row.videoID == song.next);
					else song = null;
				}
				let queue = queueStore.getOrCreate(msg.member.voice.channel, msg.channel)
				for (let songInfo of orderedSongs) {
					let song = new YouTubeSong(songInfo.videoID, songInfo.name, songInfo.length)
					queue.addSong(song)
				}
			}
		}
	}
})*/
