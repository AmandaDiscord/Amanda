const Discord = require("discord.js");

const Structures = require("./structures");

let langResultCache;

module.exports = (passthrough) => {
	let { client } = passthrough;

	/**
	 * @param {Structures.Message} msg
	 * @param {String} sentence
	 */
	function authorString(msg, sentence) {
		if (msg) return msg.author.username+", "+sentence;
		else return sentence[0].toUpperCase()+sentence.slice(1);
	}

	if (!langResultCache) {

		var lang = {
			/** @param {Error} error */
			apiError: error => "API did not return any data.```\n"+error+"```",

			dm: {
				/**@param {Structures.Message} msg */
				success: msg => authorString(msg, "I sent you a DM."),
				/**@param {Structures.Message} msg */
				failed: msg => authorString(msg, "you must allow me to DM you for that command to work. Either you've blocked me, or you need to turn on DMs in this server.")
			},

			command: {
				/**@param {Structures.Message} msg */
				dmOnly: msg => authorString(msg, "this command can only be used in DMs."),
				/**@param {Structures.Message} msg */
				guildOnly: msg => authorString(msg, "this command does not work in DMs.")
			},

			input: {
				/**
				 * @param {Structures.Message} msg
				 * @param {String} type
				 */
				invalid: (msg, type) => authorString(msg, `that's not a valid ${type}`),
				money: {
					/**
					 * @param {Structures.Message} msg
					 * @param {String} type
					 * @param {Number} min
					 */
					small: (msg, type, min) => authorString(msg, `your ${type} must be at least ${min} Discoins.`)
				},
				waifu: {
					/**
					 * @param {Structures.Message} msg
					 * @param {Number} price
					 */
					claimedByOther: (msg, price) => authorString(msg, `this person has already been claimed by somebody else, for a higher price. You'll need to spend at least ${price} Discoins to steal them.`),
					/** @param {Structures.Message} msg */
					doubleClaim: msg => authorString(msg, "you've already claimed that person as your waifu. If you'd like to increase their price, use `&gift <amount>`"),
				},
				music: {
					/** @param {Structures.Message} msg */
					invalidAction: msg => authorString(msg, "that's not a valid action. If you want to play something, try `&music play <thing>`.\nCheck out `&help music` and `&help playlists` for more things you can do!"),
					/** @param {Structures.Message} msg */
					playableRequired: msg => authorString(msg, "please provide either a YouTube video link or some words for me to search for."),
					/** @param {Structures.Message} msg */
					youTubeRequired: msg => authorString(msg, "please provide a YouTube link or video ID."),
				}
			},

			external: {
				money: {
					/**
					 * @param {Structures.Message} msg
					 * @param {String} [string]
					 */
					insufficient: (msg, string) => authorString(msg, `you don't have that many Discoins${string ? " "+string : "."}`),
					/**
					 * @param {Structures.Message} msg
					 * @param {Number} amount
					 * @param {Number|String} timeRemaining
					 */
					dailyClaimed: (msg, amount, timeRemaining) => `**${msg.author.username} claimed their daily and got ${amount} ${lang.emoji.discoin}**\nCome back in ${timeRemaining} for more coins!`,
					/**
					 * @param {Structures.Message} msg
					 * @param {Number} timeRemaining
					 */
					dailyCooldown: (msg, timeRemaining) => authorString(msg, `your daily coins will refresh in ${timeRemaining}.`)
				}
			},

			// Voice
			/** @param {Structures.Message} msg */
			voiceMustJoin: msg => authorString(msg, "you need to join a voice channel to do that."),
			/** @param {Structures.Message} msg */
			voiceNothingPlaying: msg => authorString(msg, "nothing is currently playing."),
			/** @param {String} action */
			voiceCannotAction: action => `The current queue cannot be ${action} at this time.`,
			/** @param {Structures.Message} msg */
			voiceChannelWaiting: msg => authorString(msg, "you need to join a voice channel to do that. Waiting for you to connect..."),
			/** @param {String} title */
			voiceQueueRemovedSong: title => `Removed **${title}** from the queue.`,

			// Playlists
			/** @param {Structures.Message} msg */
			playlistNotOwned: msg => authorString(msg, "you do not own that playlist and so cannot modify it."),
			/** @param {Structures.Message} msg */
			playlistDuplicateItem: msg => authorString(msg, "that song is already in the playlist."),

			// Permissions
			permissionVoiceJoin: () => "I don't have permission to join your voice channel.",
			permissionVoiceSpeak: () => "I don't have permission to speak in your voice channel.",
			permissionOtherDMBlocked: () => "I couldn't DM that person. Maybe they've blocked me, or maybe they need to turn on DMs in a shared server.",
			/** @param {String} permission */
			permissionDeniedGeneric: permission => `I don't have permission to ${permission}. I work best when I have all of the permissions I've asked for when inviting me. Please modify my permissions.`,

			// Generic
			/** @param {Structures.Message} msg */
			genericIndexOutOfRange: msg => authorString(msg, "that index is out of range."),
			/** @param {Structures.Message} msg */
			genericInvalidAction: msg => authorString(msg, "that is not a valid action."),

			// Custom emoji strings
			emoji: {
				discoin: "<a:Discoin:422523472128901140>",
				discoinurl: "https://cdn.discordapp.com/emojis/422523472128901140.gif?v=1",
				bot: "<:bot:412413027565174787>",
				boturl: "https://cdn.discordapp.com/emojis/412413027565174787.png?v=1"
			}
		}

		langResultCache = lang
	} else {
		//@ts-ignore
		var lang = langResultCache
	}

	return lang
}
