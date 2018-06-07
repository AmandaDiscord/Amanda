module.exports = function(passthrough) {
  const {Discord, djs, dio, utils} = passthrough;
  return {
    "user": {
      usage: "<user>",
      description: "Gets the user info about yourself or another user if provided.",
      process: function(msg, suffix) {
        // Get user or member
        let user, member;
        if (msg.channel.type == "text") {
          member = utils.findMember(msg, suffix, true);
          if (member) user = member.user;
        } else {
          user = utils.findUser(msg, djs, suffix, true);
        }
        if (!user) return msg.channel.send(`Couldn't find that user`);
        // Create embed
        let embed = new Discord.RichEmbed().setColor("36393E");
        // User ID
        embed.addField("User ID:", user.id);
        // Account created
        let userCreatedTime = user.createdAt.toUTCString();
        embed.addField("Account created at:", userCreatedTime);
        // Joined guild
        if (member) {
          let guildJoinedTime = member.joinedAt.toUTCString();
          embed.addField(`Joined ${msg.guild.name} at:`, guildJoinedTime);
        }
        // Presence (status)
        let status = utils.getPresenceEmoji(user.presence.status);
        if (user.bot) status = "<:bot:412413027565174787>";
        // Presence (game)
        let game = "Not playing anything";
        if (user.presence.game && user.presence.game.streaming) game = `Streaming [${member.user.presence.game.name}](${member.user.presence.game.url})`;
        else if (user.presence.game) game = utils.getPresencePrefix(user.presence.game.type)+" **"+user.presence.game.name+"**";
        // Embed thumbnail
        let pfpurl = user.avatar ? user.avatarURL : user.defaultAvatarURL;
        embed.setThumbnail(pfpurl);
        embed.addField("Avatar URL:", `[Click Here](${pfpurl})`);
        // Embed title and description
        embed.setTitle(`${user.tag} ${status}`);
        embed.setDescription(game);
        msg.channel.send(embed);
      }
    },

    "tidy": {
      usage: "<# of messages to delete>",
      description: "Tidies the chat. Requires the bot and the person who sent the message to have the manage messages permission. Default deleted messages is 50.",
      process: function(msg, suffix) {
        if(msg.channel.type !== 'text') return msg.channel.send("You cannot use this command in DMs");
        if (msg.member.hasPermission("MANAGE_MESSAGES")) {
          if (msg.guild.me.hasPermission("MANAGE_MESSAGES")) {
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
      description: "Gets the information of the emoji provided. Useful for making bot resources.",
      process: function(msg, suffix) {
        var foundEmoji = Discord.Util.parseEmoji(suffix);
        var emojiType = "";
        if (!suffix) return msg.channel.send(`${msg.author.username}, please provide an emoji as a proper argument`);
        if(foundEmoji == null) return msg.channel.send(`${msg.author.username}, That's not a valid emoji`);
        if(foundEmoji.id == null) return msg.channel.send(`${msg.author.username}, That's not a valid emoji`);
        if (foundEmoji.animated == true) var emojiType = "gif";
        else var emojiType = "png";
        const embed = new Discord.RichEmbed()
          .setAuthor(foundEmoji.name)
          .addField("Emoji ID:", `${foundEmoji.id}`)
          .addField("Link to Emoji:", `[Click Here](https://cdn.discordapp.com/emojis/${foundEmoji.id}.${emojiType})`)
          .setImage(`https://cdn.discordapp.com/emojis/${foundEmoji.id}.${emojiType}`)
          .setColor("36393E")
        msg.channel.send({embed});
      }
    },

    "emojilist": {
      usage: "",
      description: "Gets a list of every emoji in a guild",
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
      process: function(msg, suffix) {
        var foundEmoji = Discord.Util.parseEmoji(suffix);
        var emojiType = "";
        if (!suffix) return msg.channel.send(`${msg.author.username}, please provide an emoji as a proper argument`);
        if(foundEmoji == null) return msg.channel.send(`${msg.author.username}, That's not a valid emoji`);
        if(foundEmoji.id == null) return msg.channel.send(`${msg.author.username}, That's not a valid emoji`);
        if (foundEmoji.animated == true) var emojiType = "gif";
        else var emojiType = "png";
        const embed = new Discord.RichEmbed()
          .setImage(`https://cdn.discordapp.com/emojis/${foundEmoji.id}.${emojiType}`)
          .setColor("36393E")
        msg.channel.send({embed});
      }
    },

    "guild": {
      usage: "",
      description: "Gets information about the server",
      process: function(msg, suffix) {
        if(msg.channel.type !== 'text') return msg.channel.send("You can't use this command in DMs!");
        const embed = new Discord.RichEmbed()
          .setAuthor(msg.guild.name)
          .addField("Created at:", msg.guild.createdAt.toUTCString())
          .addField("Owner:", msg.guild.owner.user.tag)
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
