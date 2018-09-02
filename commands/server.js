let router = require("../router.js");
let server_info = {
	"user": {
		description: "Gets the user info about yourself or another user if provided",
		arguments: "<user>",
		aliases: ["user"],
		category: ["server", "info"],
	},
	"emoji": {
		description: "Shows information about an emoji provided",
		arguments: "<emoji>",
		aliases: ["emoji"],
		category: ["server", "info"]
	},
	"emojilist": {
		description: "Displays all of the emojis the server has",
		arguments: "none",
		aliases: ["emojilist", "emojis"],
		category: ["server", "info"]
	},
	"wumbo": {
		description: "Makes an emoji bigger",
		arguments: "<emoji>",
		aliases: ["wumbo"],
		category: ["server", "info"]
	},
	"guild": {
		description: "Gets information about the server",
		arguments: "none",
		aliases: ["guild", "server"],
		category: ["server", "info"]
	},
	"avatar": {
		description: "Gets your avatar or another user's avatar",
		arguments: "<user>",
		aliases: ["avatar", "pfp"],
		category: ["server", "info"]
	},
	"tidy": {
		description: "Purges the chat by a defined amount of messages",
		arguments: "<amount>",
		aliases: ["tidy", "purge"],
		category: ["server", "moderation"]
	},
	"kick": {
		description: "Kicks a member from a server",
		arguments: "<user>",
		aliases: ["kick"],
		category: ["server", "moderation"]
	},
	"ban": {
		description: "Bans a member from a server",
		arguments: "<user>",
		aliases: ["ban"],
		category: ["server", "moderation"]
	},
	"hackban": {
		description: "Bans a person from a server even if they are not in the server",
		arguments: "<user ID>",
		aliases: ["hackban", "hb"],
		category: ["server", "moderation"]
	}
}

router.emit("help", server_info);
router.on("command", file_server);
router.once(__filename, () => {
	router.removeListener("command", file_server);
});
async function file_server(passthrough) {
	let { Discord, client, msg, cmd, suffix } = passthrough;

	if (cmd == "user") {
		let user, member;
		if (msg.channel.type == "text") {
			member = msg.guild.findMember(msg, suffix, true);
			if (member) user = member.user;
		} else user = client.findUser(msg, suffix, true);
		if (!user) return msg.channel.send(`Couldn't find that user`);
		let embed = new Discord.RichEmbed().setColor("36393E");
		embed.addField("User ID:", user.id);
		let userCreatedTime = user.createdAt.toUTCString();
		embed.addField("Account created at:", userCreatedTime);
		if (member) {
			let guildJoinedTime = member.joinedAt.toUTCString();
			embed.addField(`Joined ${msg.guild.name} at:`, guildJoinedTime);
		}
		let status = user.presenceEmoji;
		let game = "No activity set";
		if (user.presence.game && user.presence.game.streaming) {
			game = `Streaming [${user.presence.game.name}](${user.presence.game.url})`;
			if (user.presence.game.details) game += ` <:RichPresence:477313641146744842>\nPlaying ${user.presence.game.details}`;
			status = `<:streaming:454228675227942922>`;
		} else if (user.presence.game) {
			game = user.presencePrefix+" **"+user.presence.game.name+"**";
			if (user.presence.game.details) game += ` <:RichPresence:477313641146744842>\n${user.presence.game.details}`;
			if (user.presence.game.state && user.presence.game.name == "Spotify") game += `\nby ${user.presence.game.state}`;
			else if (user.presence.game.state) game += `\n${user.presence.game.state}`;
		}
		if (user.bot) status = "<:bot:412413027565174787>";
		embed.setThumbnail(user.displayAvatarURL);
		embed.addField("Avatar URL:", `[Click Here](${user.displayAvatarURL})`);
		embed.setTitle(`${user.tag} ${status}`);
		embed.setDescription(game);
		return msg.channel.send({embed});
	}

	else if (cmd == "emoji") {
		if (!suffix) return msg.channel.send(`${msg.author.username}, please provide an emoji as a proper argument`);
		let emoji = client.parseEmoji(suffix);
		if (emoji == null) return msg.channel.send(`${msg.author.username}, that is not a valid emoji`);
		let embed = new Discord.RichEmbed()
			.setAuthor(emoji.name)
			.addField("Emoji ID:", `${emoji.id}`)
			.addField("Link to Emoji:", `[Click Here](${emoji.url})`)
			.setImage(emoji.url)
			.setColor("36393E")
		return msg.channel.send({embed});
	}


	else if (cmd == "emojilist" || cmd == "emojis") {
		if (msg.channel.type !== 'text') return msg.channel.send("You can't use this command in DMs!");
		let emoji = msg.guild.emojis.map(e=>e.toString()).join(" ");
		if (emoji.length > 2048) return msg.channel.send(`${msg.author.username}, there are to many emojis to be displayed`);
		let embed = new Discord.RichEmbed()
			.setDescription(emoji)
			.setColor("36393E")
		return msg.channel.send({embed});
	}


	else if (cmd == "wumbo") {
		if (!suffix) return msg.channel.send(`${msg.author.username}, please provide an emoji as a proper argument`);
		let emoji = client.parseEmoji(suffix);
		if (emoji == null) return msg.channel.send(`${msg.author.username}, that is not a valid emoji`);
		let embed = new Discord.RichEmbed()
			.setImage(emoji.url)
			.setColor("36393E")
		return msg.channel.send({embed});
	}


	else if (cmd == "guild" || cmd == "server") {
		if(msg.channel.type !== 'text') return msg.channel.send("You can't use this command in DMs!");
		let owner = await client.fetchUser(msg.guild.ownerID);
		let embed = new Discord.RichEmbed()
			.setAuthor(msg.guild.name)
			.addField("Created at:", new Date(msg.guild.createdAt).toUTCString())
			.addField("Owner:", `${owner.tag} <:OwnerCrown:455188860817899520>`)
			.addField("Member Count:", `${msg.guild.memberCount} members`)
			.addField("Guild ID:", msg.guild.id)
			.setThumbnail(msg.guild.iconURL)
			.setColor("36393E")
		return msg.channel.send({embed});
	}


	else if (cmd == "avatar" || cmd == "pfp") {
		let user, member;
		if (msg.channel.type == "text") {
			member = msg.guild.findMember(msg, suffix, true);
			if (member) user = member.user;
		} else user = client.findUser(msg, suffix, true);
		if (!user) return msg.channel.send(`Couldn't find that user`);
		let embed = new Discord.RichEmbed()
			.setImage(user.displayAvatarURL)
			.setColor("36393E");
		return msg.channel.send({embed});
	}


	else if (cmd == "tidy" || cmd == "purge") {
		if (msg.channel.type !== 'text') return msg.channel.send("You cannot use this command in DMs");
		if (msg.member.hasPermission("MANAGE_MESSAGES")) {
			if (msg.guild.me.hasPermission("MANAGE_MESSAGES")) {
				if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide a number of messages to delete`);
				suffix = parseInt(suffix);
				if (isNaN(suffix)) return msg.channel.send(`That's not a valid number of messages to delete`);
				if (suffix > 100) return msg.channel.send(`${msg.author.username}, I can only delete up to 100 messages.`);
				return msg.channel.bulkDelete(suffix).then(messages => msg.channel.send(`Deleted ${messages.size} messages`)).then(nmsg => nmsg.delete(5000));
			} else return msg.channel.send(`${msg.author.username}, I don't have the manage messages permission`);
		} else return msg.channel.send(`${msg.author.username}, you don't have the manage messages permission.`);
	}


	else if (cmd == "kick") {
		if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
		if (msg.member.hasPermission("KICK_MEMBERS")) {
			if (msg.guild.me.hasPermission("KICK_MEMBERS")) {
				if (!suffix) return msg.channel.send("You have to tell me who to kick!");
				let member = msg.guild.findMember(msg, suffix);
				if (member == null) return msg.channel.send("I could not find that user to kick");
				if (member.user.id == msg.author.id) return msg.channel.send("You can't kick yourself, silly");
				if (member.kickable == false) return msg.channel.send(`I am not able to kick that user. They may possess a role higher than my highest`);
				try {
					member.kick({ reason: `Kicked by ${msg.author.id} aka ${msg.author.tag}` });
					return msg.channel.send("👌");
				} catch(reason) { return msg.channel.send(`There was an error with kicking that member\n\`\`\`js\n${reason}\n\`\`\``); }
			} else return msg.channel.send(`${msg.author.username}, I don't have the kick member permission`);
		} else return msg.channel.send(`${msg.author.username}, you don't have the kick member permission`);
	}


	else if (cmd == "ban") {
		if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
		if (msg.member.hasPermission("BAN_MEMBERS")) {
			if (msg.guild.me.hasPermission("BAN_MEMBERS")) {
				if (!suffix) return msg.channel.send("You have to tell me who to ban!");
				let member = msg.guild.findMember(msg, suffix);
				if (member == null) return msg.channel.send("I could not find that user to ban");
				if (member.user.id == msg.author.id) return msg.channel.send("You can't ban yourself, silly");
				if (member.bannable == false) return msg.channel.send(`I am not able to ban that user. They may possess a role higher than or equal to my highest`);
				try {
					await msg.guild.ban(suffix, { reason: `Banned by ${msg.author.id} aka ${msg.author.tag}` });
					return msg.channel.send("👌");
				} catch(reason) { return msg.channel.send(`There was an error with banning that member\n\`\`\`js\n${reason}\n\`\`\``); }
			} else return msg.channel.send(`${msg.author.username}, I don't have the ban member permission`);
		} else return msg.channel.send(`${msg.author.username}, you don't have the ban member permission`);
	}


	else if (cmd == "hackban" || cmd == "hb") {
		if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
		if (msg.member.hasPermission("BAN_MEMBERS")) {
			if (msg.guild.me.hasPermission("BAN_MEMBERS")) {
				if (!suffix) return msg.channel.send("You have to tell me who to hackban!");
				if (suffix == 1) return msg.channel.send(`${msg.author.username}, that is not a valid user Snowflake`);
				try { await client.fetchUser(suffix); } catch (error) { return msg.channel.send(`${msg.author.username}, that is not a valid user Snowflake`); }
				try {
					await msg.guild.ban(suffix, { reason: `Banned by ${msg.author.id} aka ${msg.author.tag}` });
					return msg.channel.send("👌");
				} catch (reason) { return msg.channel.send(`There was an error with banning that member\n\`\`\`js\n${reason}\n\`\`\``); }
			} else return msg.channel.send(`${msg.author.username}, I don't have the ban member permission`);
		} else return msg.channel.send(`${msg.author.username}, you don't have the ban member permission`);
	}
}