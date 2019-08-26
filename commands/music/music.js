//@ts-check

const ytdl = require("ytdl-core")
const YouTube = require('simple-youtube-api')
const net = require("net")
const crypto = require("crypto")
const rp = require("request-promise")
const Discord = require("discord.js")
const path = require("path")

const passthrough = require("../../passthrough")
let {config, client, reloadEvent, reloader, commands, queueStore} = passthrough

let utils = require("../../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

let lang = require("../../modules/lang.js")
reloader.useSync("./modules/lang.js", lang)

let songTypes = require("./songtypes.js")
reloader.useSync("./commands/music/songtypes.js", songTypes)

let queueFile = require("./queue.js")
reloader.useSync("./commands/music/queue.js", queueFile)

/*let playlistCommand = require("./playlistcommand.js")
reloader.useSync("./commands/music/playlistcommand.js", playlistCommand)*/

let common = require("./common.js")
reloader.useSync("./commands/music/common.js", common)

/**
 * @param {songTypes.Song} song
 * @param {Discord.TextChannel} textChannel
 * @param {Discord.VoiceChannel} voiceChannel
 * @param {Boolean} [insert]
 * @param {Discord.Message} [context]
 */
function handleSong(song, textChannel, voiceChannel, insert = undefined, context) {
	let queue = queueStore.getOrCreate(voiceChannel, textChannel)
	let result = queue.addSong(song, insert)
	if (context instanceof Discord.Message && result == 0) {
		context.react("✅")
	}
}

class VoiceStateCallback {
	/**
	 * @param {String} userID
	 * @param {Discord.Guild} guild
	 * @param {Number} timeoutMs
	 * @param {(voiceChannel: Discord.VoiceChannel) => void} callback
	 * @constructor
	 */
	constructor(userID, guild, timeoutMs, callback) {
		this.userID = userID;
		this.guild = guild;
		this.timeout = setTimeout(() => this.cancel(), timeoutMs);
		this.callback = callback;
		this.active = true;
		voiceStateCallbackManager.getAll(this.userID, this.guild).forEach(o => o.cancel());
		this.add();
	}
	add() {
		voiceStateCallbackManager.callbacks.push(this);
	}
	remove() {
		let index = voiceStateCallbackManager.callbacks.indexOf(this);
		if (index != -1) voiceStateCallbackManager.callbacks.splice(index, 1);
	}
	/**
	 * @param {Discord.VoiceChannel} voiceChannel
	 */
	trigger(voiceChannel) {
		if (this.active) {
			this.active = false;
			this.remove();
			this.callback(voiceChannel);
		}
	}
	cancel() {
		if (this.active) {
			this.active = false;
			this.remove();
			this.callback(null);
		}
	}
}
const voiceStateCallbackManager = {
	callbacks: [],
	/**
	 * @param {String} userID
	 * @param {Discord.Guild} guild
	 * @returns {Array<VoiceStateCallback>}
	 */
	getAll: function(userID, guild) {
		return this.callbacks.filter(o => o.userID == userID && o.guild == guild);
	}
}
/**
 * @param {String} userID
 * @param {Discord.Guild} guild
 * @param {Number} timeoutMs
 * @returns {Promise<Discord.VoiceChannel>}
 */
function getPromiseVoiceStateCallback(userID, guild, timeoutMs) {
	return new Promise(resolve => {
		new VoiceStateCallback(userID, guild, timeoutMs, voiceChannel => resolve(voiceChannel));
	});
}

utils.addTemporaryListener(client, "voiceStateUpdate", path.basename(__filename), (oldState, newState) => {
	// Process waiting to join
	if (newState.id != client.user.id && newState.channel) voiceStateCallbackManager.getAll(newState.id, newState.guild).forEach(state => state.trigger(newState.channel))

	// Pass on to queue for leave timeouts
	let channel = oldState.channel || newState.channel;
	if (!channel || !channel.guild) return;
	let queue = queueStore.get(channel.guild.id);
	if (queue) queue.voiceStateUpdate(oldState, newState);
});

/**
 * @param {Discord.Message} msg
 * @param {Boolean} wait
 * @returns {Promise<(Discord.VoiceChannel|null)>}
 */
async function detectVoiceChannel(msg, wait) {
	if (msg.member.voice.channel) return msg.member.voice.channel;
	if (!wait) return null;
	let voiceWaitMsg = await msg.channel.send(lang.voiceChannelWaiting(msg));
	return getPromiseVoiceStateCallback(msg.author.id, msg.guild, 30000);
}

/**
 * @type {Map<String, {voiceChannel?: String, queue?: String, code: (msg: Discord.Message, args: Array<String>, _: ({voiceChannel: Discord.VoiceChannel, queue: queueFile.Queue})) => any}>}
 */
const subcommandsMap = new Map([
	["play", {
		voiceChannel: "ask",
		code: async (msg, args, {voiceChannel}) => {
		}
	}],
	["stop", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			queue.wrapper.stop()
		}
	}],
	["queue", {
		queue: "required",
		code: async (msg, args, {queue}) => {
			let rows = queue.songs.map((song, index) => `${index+1}. `+song.queueLine)
			let totalLength = "\nTotal length: "+common.prettySeconds(queue.getTotalLength())
			let body = utils.compactRows.removeMiddle(rows, 2000-totalLength.length).join("\n") + totalLength
			msg.channel.send(
				new Discord.MessageEmbed()
				.setTitle(`Queue for ${Discord.Util.escapeMarkdown(msg.guild.name)}`)
				.setDescription(body)
				.setColor(0x36393f)
			)
		}
	}],
	["skip", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			queue.wrapper.skip()
		}
	}],
	["auto", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			// not implemented
		}
	}],
	["now", {
		queue: "required",
		code: async (msg, args, {queue}) => {
			if (msg.channel.id == queue.textChannel.id) {
				queue.sendNewNP(true)
			} else {
				msg.channel.send(`The current music session is over in ${queue.textChannel}. Go there to see what's playing!`)
			}
		}
	}],
	["info", {
		queue: "required",
		code: async (msg, args, {queue}) => {
			// broken
			//queue.wrapper.showInfo();
		}
	}],
	["pause", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			queue.wrapper.pause(msg)
		}
	}],
	["resume", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {queue}) => {
			queue.wrapper.resume(msg)
		}
	}],
	["related", {
		voiceChannel: "required",
		queue: "required",
		code: async (msg, args, {voiceChannel, queue}) => {
			// broken
		}
	}],
	["playlist", {
		voiceChannel: "provide",
		code: async (msg, args, {voiceChannel}) => {
			// broken
		}
	}]
])

// left side is user input, right side is mapped subcommand
const subcommandAliasMap = new Map([
	["p", "play"],
	["i", "play"],
	["insert", "play"],
	["q", "queue"],
	["s", "skip"],
	["n", "now"],
	["rel", "related"],
	["pl", "playlist"],
	["playlists", "playlist"]
])
for (let key of subcommandsMap.keys()) {
	subcommandAliasMap.set(key, key)
}

commands.assign({
	"musictoken": {
		usage: "[new|delete]",
		description: "Obtain a web dashboard login token",
		aliases: ["token", "musictoken", "webtoken", "musictokens", "webtokens"],
		category: "meta",
		process: async function(msg, suffix) {
			if (suffix == "delete") {
				await deleteAll()
				msg.author.send("Deleted all your tokens. Use `&musictoken new` to generate a new one.")
			} else if (suffix == "new") {
				await deleteAll()
				let hash = crypto.randomBytes(24).toString("base64").replace(/\W/g, "_")
				await utils.sql.all("INSERT INTO WebTokens VALUES (?, ?, ?)", [msg.author.id, hash, 1]);
				send(
					`Your existing tokens were deleted, and a new one was created.`
					+"\nDo not share this token with anyone. If you do accidentally share it, you can use `&musictoken delete` to delete it and keep you safe."
					+`\nYou can now log in! ${config.website_protocol}://${config.website_domain}/dash`
				)
				send("`"+hash+"`")
			} else {
				let existing = await utils.sql.get("SELECT * FROM WebTokens WHERE userID = ?", msg.author.id)
				if (existing) {
					send(
						"Here is the token you generated previously:"
						+"\nYou can use `&musictoken delete` to delete it, and `&musictoken new` to regenerate it."
					)
					send("`"+existing.token+"`")
				} else {
					send("You do not currently have any tokens. Use `&musictoken new` to generate a new one.")
				}
			}

			function deleteAll() {
				return utils.sql.all("DELETE FROM WebTokens WHERE userID = ?", msg.author.id);
			}

			function send(text) {
				return msg.author.send(text).then(() => {
					if (msg.channel.type == "text") msg.channel.send(`I sent you a DM.`)
				}).catch(() => {
					msg.channel.send(`Please allow me to send you DMs.`)
				})
			}
		}
	},
	"frisky": {
		usage: "[frisky|deep|chill]",
		description: "Frisky radio",
		aliases: ["frisky"],
		category: "music",
		process: async function(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.command.guildOnly(msg));
			const voiceChannel = msg.member.voice.channel;
			if (!voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg));
			let station = ["frisky", "deep", "chill"].includes(suffix) ? suffix : "frisky";
			let stream = new songTypes.FriskySong(station);
			return handleSong(stream, msg.channel, voiceChannel, false, msg);
		}
	},
	"music": {
		usage: "none",
		description: "You're not supposed to see this",
		aliases: ["music", "m"],
		category: "music",
		process: async function(msg, suffix) {
			// No DMs
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(lang.command.guildOnly(msg))
			// Args
			let args = suffix.split(" ")
			// Find subcommand
			let subcommand = args[0] ? args[0].trim().toLowerCase() : ""
			let key = subcommandAliasMap.get(subcommand)
			let subcommandObject = subcommandsMap.get(key)
			if (!subcommandObject) return msg.channel.send(lang.input.music.invalidAction(msg))
			// Create data for subcommand
			let subcommmandData = {}
			// Provide a queue?
			if (subcommandObject.queue == "required") {
				let queue = queueStore.get(msg.guild.id)
				if (!queue) return msg.channel.send(lang.voiceNothingPlaying(msg))
				subcommmandData.queue = queue
			}
			// Provide a voice channel?
			if (subcommandObject.voiceChannel) {
				if (subcommandObject.voiceChannel == "required") {
					let voiceChannel = await detectVoiceChannel(msg, false)
					if (!voiceChannel) return msg.channel.send(lang.voiceMustJoin(msg))
					subcommmandData.voiceChannel = voiceChannel
				} else if (subcommandObject.voiceChannel == "ask") {
					let voiceChannel = await detectVoiceChannel(msg, true)
					if (!voiceChannel) return // this was stupid: msg.channel.send(lang.voiceMustJoin(msg))
					subcommmandData.voiceChannel = voiceChannel
				} else if (subcommandObject.voiceChannel == "provide") {
					let voiceChannel = await detectVoiceChannel(msg, false)
					subcommmandData.voiceChannel = voiceChannel
				}
			}
			// Hand over execution to the subcommand
			subcommandObject.code(msg, args, subcommmandData)
		}
	},
	"resume": {
		aliases: ["resume"],
		category: "admin",
		description: "",
		usage: "",
		process: (msg) => {
			client.lavalink.join({
				guild: msg.guild.id,
				channel: msg.member.voice.channel.id,
				host: client.lavalink.nodes.first().host
			})
		}
	}
})
