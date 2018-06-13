module.exports = function(passthrough) {
	const {Discord, djs, dio, utils} = passthrough;
	return {
		"user": {
			usage: "<user>",
			description: "Gets the user info about yourself or another user if provided.",
			aliases: ["user"],
			process: function(msg, suffix) {
				let user, member;
				if (msg.channel.type == "text") {
					member = utils.findMember(msg, suffix, true);
					if (member) user = member.user;
				} else {
					user = utils.findUser(msg, djs, suffix, true);
				}
				if (!user) return msg.channel.send(`Couldn't find that user`);
				let embed = new Discord.RichEmbed().setColor("36393E");
				embed.addField("User ID:", user.id);
				let userCreatedTime = user.createdAt.toUTCString();
				embed.addField("Account created at:", userCreatedTime);
				if (member) {
					let guildJoinedTime = member.joinedAt.toUTCString();
					embed.addField(`Joined ${msg.guild.name} at:`, guildJoinedTime);
				}
				let status = utils.getPresenceEmoji(user.presence.status);
				let game = "No activity set";
				if (user.presence.game && user.presence.game.streaming) {
					 game = `Streaming [${user.presence.game.name}](${user.presence.game.url})`;
					 status = `<:streaming:454228675227942922>`;
				} else if (user.presence.game) game = utils.getPresencePrefix(user.presence.game.type)+" **"+user.presence.game.name+"**";
				if (user.bot) status = "<:bot:412413027565174787>";
				embed.setThumbnail(user.displayAvatarURL);
				embed.addField("Avatar URL:", `[Click Here](${user.displayAvatarURL})`);
				embed.setTitle(`${user.tag} ${status}`);
				embed.setDescription(game);
				msg.channel.send({embed});
			}
		},

		"avatar": {
			usage: "<user>",
			description: "Gets the avatar of a user",
			aliases: ["avatar", "pfp"],
			process: function(msg, suffix) {
				let user, member;
				if (msg.channel.type == "text") {
					member = utils.findMember(msg, suffix, true);
					if (member) user = member.user;
				} else {
					user = utils.findUser(msg, djs, suffix, true);
				}
				if (!user) return msg.channel.send(`Couldn't find that user`);
				const embed = new Discord.RichEmbed()
					.setImage(user.displayAvatarURL)
					.setColor("36393E");
				msg.channel.send({embed});
			}
		},

		"tidy": {
			usage: "<# of messages to delete>",
			description: "Tidies the chat. Requires the bot and the person who sent the message to have the manage messages permission",
			aliases: ["tidy", "purge"],
			process: function(msg, suffix) {
				if(msg.channel.type !== 'text') return msg.channel.send("You cannot use this command in DMs");
				if (msg.member.hasPermission("MANAGE_MESSAGES")) {
					if (msg.guild.me.hasPermission("MANAGE_MESSAGES")) {
						if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide a number of messages to delete`);
						suffix = parseInt(suffix);
						if (isNaN(suffix)) return msg.channel.send(`That's not a valid number of messages to delete`);
						if (suffix > 100) return msg.channel.send(`${msg.author.username}, I can only delete up to 100 messages.`);
						msg.channel.bulkDelete(suffix).then(messages => msg.channel.send(`Deleted ${messages.size} messages`)).then(nmsg => nmsg.delete(5000)).catch(() => { return });
					} else msg.channel.send(`${msg.author.username}, I don't have the manage messages permission`);
				} else msg.channel.send(`${msg.author.username}, you don't have the manage messages permission.`);
			}
		},

		"emoji": {
			usage: "<:emoji:>",
			description: "Gets the information of the emoji provided",
			aliases: ["emoji"],
			process: function(msg, suffix) {
				if (!suffix) return msg.channel.send(`${msg.author.username}, please provide an emoji as a proper argument`);
				var emoji = utils.emoji(suffix);
				if (emoji == null) return msg.channel.send(`${msg.author.username}, that is not a valid emoji`);
				const embed = new Discord.RichEmbed()
					.setAuthor(emoji.name)
					.addField("Emoji ID:", `${emoji.id}`)
					.addField("Link to Emoji:", `[Click Here](${emoji.url})`)
					.setImage(emoji.url)
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},

		"emojilist": {
			usage: "",
			description: "Gets a list of every emoji in a guild",
			aliases: ["emojilist"],
			process: function(msg, suffix) {
				if(msg.channel.type !== 'text') return msg.channel.send("You can't use this command in DMs!");
				var emoji = msg.guild.emojis.map(e=>e.toString()).join(" ");
				if (emoji.length > 2048) return msg.channel.send(`${msg.author.username}, there are to many emojis to be displayed`);
				const embed = new Discord.RichEmbed()
					.setDescription(emoji)
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},
		"wumbo": {
			usage: "<:emoji:>",
			description: "Makes an emoji bigger",
			aliases: ["wumbo"],
			process: function(msg, suffix) {
				if (!suffix) return msg.channel.send(`${msg.author.username}, please provide an emoji as a proper argument`);
				var emoji = utils.emoji(suffix);
				if (emoji == null) return msg.channel.send(`${msg.author.username}, that is not a valid emoji`);
				const embed = new Discord.RichEmbed()
					.setImage(emoji.url)
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},

		"guild": {
			usage: "",
			description: "Gets information about the server",
			aliases: ["guild", "server"],
			process: function(msg, suffix) {
				if(msg.channel.type !== 'text') return msg.channel.send("You can't use this command in DMs!");
				const embed = new Discord.RichEmbed()
					.setAuthor(msg.guild.name)
					.addField("Created at:", utils.humanize(msg.guild.createdAt, "date"))
					.addField("Owner:", msg.guild.owner? `${msg.guild.owner.user.tag} <:OwnerCrown:455188860817899520>`: "Server owner not in cache")
					.addField("Member Count:", `${msg.guild.memberCount} members`)
					.addField("Guild ID:", msg.guild.id)
					.setThumbnail(msg.guild.iconURL)
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},

		"ban": {
			usage: "<user>",
			description: "Bans a member",
			aliases: ["ban"],
			process: function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				if (msg.member.hasPermission("BAN_MEMBERS")) {
					if (msg.guild.me.hasPermission("BAN_MEMBERS")) {
						if (!suffix) return msg.channel.send("You have to tell me who to ban!");
						var member = utils.findMember(msg, suffix);
						if (member == null) return msg.channel.send("I could not find that user to ban");
						if (member.user.id == msg.author.id) return msg.channel.send("You can't ban yourself, silly");
						if (member.bannable == false) return msg.channel.send(`I am not able to ban that user. They may possess a role higher than or equal to my highest`);
						try {
							member.ban();
							msg.channel.send("👌");
						} catch(reason) {
							msg.channel.send(`There was an error with banning that member\n\`\`\`js\n${reason}\n\`\`\``);
						}
					} else msg.channel.send(`${msg.author.username}, I don't have the ban member permission`);
				} else msg.channel.send(`${msg.author.username}, you don't have the ban member permission`);
			}
		},

		"hackban": {
			usage: "<snowflake / ID>",
			description: "Bans a member who may not be in the guild. Still works if they are. Requires a user ID to be passed as an argument",
			aliases: ["hackban", "hb"],
			process: function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				if (msg.member.hasPermission("BAN_MEMBERS")) {
					if (msg.guild.me.hasPermission("BAN_MEMBERS")) {
						if (!suffix) return msg.channel.send("You have to tell me who to hackban!");
						if (suffix.length < 18) return msg.channel.send(`${msg.author.username}, that is not a valid Snowflake`);
						try {
							msg.guild.ban(suffix, { reason: `Banned by ${msg.author.id} aka ${msg.author.tag}` });
							msg.channel.send("👌");
						} catch (reason) {
							msg.channel.send(`There was an error with banning that member\n\`\`\`js\n${reason}\n\`\`\``);
						}
					} else msg.channel.send(`${msg.author.username}, I don't have the ban member permission`);
				} else msg.channel.send(`${msg.author.username}, you don't have the ban member permission`);
			}
		},

		"kick": {
			usage: "<user>",
			description: "Kicks a member",
			aliases: ["kick"],
			process: function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				if (msg.member.hasPermission("KICK_MEMBERS")) {
					if (msg.guild.me.hasPermission("KICK_MEMBERS")) {
						if (!suffix) return msg.channel.send("You have to tell me who to kick!");
						var member = utils.findMember(msg, suffix);
						if (member == null) return msg.channel.send("I could not find that user to kick");
						if (member.user.id == msg.author.id) return msg.channel.send("You can't kick yourself, silly");
						if (member.kickable == false) return msg.channel.send(`I am not able to kick that user. They may possess a role higher than my highest`);
						try {
							member.kick();
							msg.channel.send("👌");
						} catch(reason) {
							msg.channel.send(`There was an error with kicking that member\n\`\`\`js\n${reason}\n\`\`\``);
						}
					} else msg.channel.send(`${msg.author.username}, I don't have the kick member permission`);
				} else msg.channel.send(`${msg.author.username}, you don't have the kick member permission`);
			}
		}
	}
}
