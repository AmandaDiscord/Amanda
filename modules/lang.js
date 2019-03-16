module.exports = (passthrough) => {
	let { Discord, client } = passthrough;

	function authorString(msg, sentence) {
		if (msg) return msg.author.username+", "+sentence;
		else return sentence[0].toUpperCase()+sentence.slice(1);
	}

	/**
	 * A collection of strings which purpose is to unify messages returned by the client
	 */
	Discord.Client.prototype.lang = {
		apiError: error => "API did not return any data.```\n"+error+"```",

		dm: {
			success: msg => authorString(msg, "I sent you a DM."),
			failed: msg => authorString(msg, "you must allow me to DM you for that command to work. Either you've blocked me, or you need to turn on DMs in this server.")
		},

		command: {
			dmOnly: msg => authorString(msg, "this command can only be used in DMs."),
			guildOnly: msg => authorString(msg, "this command does not work in DMs.")
		},

		input: {
			invalid: (msg, type) => authorString(msg, `that's not a valid ${type}`),
			money: {
				small: (msg, type, min) => authorString(msg, `your ${type} must be at least ${min} Discoins.`)
			},
			waifu: {
				claimedByOther: (msg, price) => authorString(msg, `this person has already been claimed by somebody else, for a higher price. You'll need to spend at least ${price} Discoins to steal them.`),
				doubleClaim: msg => authorString(msg, "you've already claimed that person as your waifu. If you'd like to increase their price, use `&gift <amount>`"),
			},
			music: {
				playableRequired: msg => authorString(msg, "please provide either a YouTube video link or some words for me to search for."),
				youTubeRequired: msg => authorString(msg, "please provide a YouTube link or video ID."),
			}
		},

		external: {
			money: {
				insufficient: (msg, string) => authorString(msg, `you don't have that many Discoins${string ? " "+string : "."}`),
				dailyClaimed: (msg, amount, timeRemaining) => `**${msg.author.username} claimed their daily and got ${amount} ${client.lang.emoji.discoin}**\nCome back in ${timeRemaining} for more coins!`,
				dailyCooldown: (msg, timeRemaining) => authorString(msg, `your daily coins will refresh in ${timeRemaining}.`)
			}
		},

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
		permissionOtherDMBlocked: () => "I couldn't DM that person. Maybe they've blocked me, or maybe they need to turn on DMs in a shared server.",

		// Generic
		genericIndexOutOfRange: msg => authorString(msg, "that index is out of range."),
		genericInvalidAction: msg => authorString(msg, "that is not a valid action."),

		// Custom emoji strings
		emoji: {
			discoin: "<a:Discoin:422523472128901140>"
		},
	}
}