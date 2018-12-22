let util = require("util");
const events = require("events");
let reactionMenus = {};

module.exports = (passthrough) => {
	let { utils } = passthrough;

	function authorString(msg, sentence) {
		if (msg) return msg.author.username+", "+sentence;
		else return sentence[0].toUpperCase()+sentence.slice(1);
	}

	utils.lang = {
		// Whole command
		commandDMOnly: msg => authorString(msg, "this command can only be used in DMs."),
		commandGuildOnly: msg => authorString(msg, "this command does not work in DMs."),

		// Bad input
		inputNoUser: msg => authorString(msg, "that's not a valid user."),
		inputBadUser: msg => authorString(msg, "that's not a valid user."),
		inputBadMoney: (msg, type) => authorString(msg, `that's not a valid ${type}.`),
		inputSmallMoney: (msg, type, min) => authorString(msg, `your ${type} must be at least ${min} Discoins.`),
		inputDoubleClaim: msg => authorstring(msg, "you've already claimed that person as your waifu. If you'd like to increase their price, use `&gift <amount>`"),
		inputNoEmoji: msg => authorString(msg, "you need to provide an emoji."),
		inputPlayableRequired: msg => authorString(msg, "please provide either a YouTube video link or some words for me to search for."),
		inputYouTubeRequired: msg => authorString(msg, "please provide a YouTube link or video ID."),

		// Bad externals
		externalBankruptGeneric: msg => authorString(msg, "you don't have that many Discoins."),
		externalBankruptBet: msg => authorString(msg, "you don't have enough Discoins to make that bet."),
		externalBankruptClaim: msg => authorString(msg, "you don't have enough Discoins to claim that person."),
		externalDailyClaimed: (msg, amount, timeRemaining) => `**${msg.author.username} claimed their daily and got ${amount} ${utils.lang.emojiDiscoin}**\nCome back in ${timeRemaining} for more coins!`,
		externalDailyCooldown: (msg, timeRemaining) => authorString(msg, `your daily coins will refresh in ${timeRemaining}.`),

		// Bad API response
		apiImageError: error => "API did not return an image.```\n"+error+"```",

		// Success
		successDM: msg => authorString(msg, "I sent you a DM."),

		// Voice
		voiceMustJoin: msg => authorString(msg, "you must join a voice channel first."),
		voiceNothingPlaying: msg => authorString(msg, "nothing is currently playing."),
		voiceCannotAction: action => `The current queue cannot be ${action} at this time.`,

		// Playlists
		playlistNotOwned: msg => authorString(msg, "you do not own that playlist and so cannot modify it."),
		playlistDuplicateItem: msg => authorString(msg, "that song is already in the playlist."),

		// Permissions
		permissionVoiceJoin: () => "I don't have permission to join your voice channel.",
		permissionVoiceSpeak: () => "I don't have permission to speak in your voice channel.",
		permissionAuthorDMBlocked: msg => authorString(msg, "you must allow me to DM you for that command to work. Either you've blocked me, or you need to turn on DMs in this server."),
		permissionOtherDMBlocked: () => "I couldn't DM that person. Maybe they've blocked me, or maybe they need to turn on DMs in a shared server.",

		// Generic
		genericIndexOutOfRange: msg => authorString(msg, "that index is out of range."),
		genericInvalidAction: msg => authorString(msg, "that is not a valid action."),

		// Custom emoji strings
		emojiDiscoin: "<a:Discoin:422523472128901140>"
	}
}