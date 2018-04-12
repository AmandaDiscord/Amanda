function findMember(msg, suffix, self = false) {
  if (!suffix) {
    if (self) return msg.member
    else return null
  } else {
    let member = msg.mentions.members.first() || msg.guild.members.get(suffix) || msg.guild.members.find(m => m.displayName.toLowerCase().includes(suffix.toLowerCase()) || m.user.username.toLowerCase().includes(suffix.toLowerCase()));
    return member
  }
}

module.exports = function(passthrough) {
  const {Discord, djs, dio} = passthrough;
  return {
    "user": {
      usage: "<user>",
      description: "Gets the user info about yourself or another user if provided.",
      process: function(msg, suffix) {
        if(msg.channel.type !== 'text') return msg.channel.send("You can't use this command in DMs!");
          var member = findMember(msg, suffix, true);
          if (member == null) return msg.channel.send("Could not find that user");
          var guildJoinedTime = new Date(member.joinedAt).toUTCString();
          var userCreatedTime = new Date(member.user.createdAt).toUTCString();
          const embed = new Discord.RichEmbed()
            .setAuthor(`User data for: ${member.user.username}`)
            .addField("User#Discrim:", `${member.user.tag}`)
            .addField("User ID:", member.user.id)
            .addField("Account created at:", userCreatedTime)
            .addField("Joined guild at:", guildJoinedTime)
            .addField("Avatar URL:", `[Click Here](${member.user.avatarURL})`)
            .setThumbnail(member.user.avatarURL)
            .setColor('RANDOM')
          msg.channel.send({embed});
      }
    },

    "tidy": {
      usage: "<# of messages to delete>",
      description: "Tidies the chat. Requires the bot and the person who sent the message to have the manage messages permission. Default deleted messages is 50.",
      process: function(msg, suffix) {
        if(msg.channel.type !== 'text') return msg.channel.send("You can't use this command in DMs!");
        if (msg.member.hasPermission("MANAGE_MESSAGES")) {
          if (msg.guild.me.hasPermission("MANAGE_MESSAGES")) {
            if (isNaN(suffix)) {
              return msg.channel.send(`That's not a valid number of messages to delete`);
            }
            if (suffix > 100) {
              return msg.channel.send(`${msg.author.username}, I can only delete up to 100 messages.`)
            }
            msg.channel.bulkDelete(suffix).then(messages => msg.channel.send(`Deleted ${messages.size} messages`)).then(nmsg => nmsg.delete(5000))
          } else {
            return msg.channel.send(`${msg.author.username}, I don't have the manage messages permission`);
          }
        } else {
          return msg.channel.send(`${msg.author.username}, you don't have the manage messages permission.`);
        }
      }
    },

    "emoji": {
      usage: "<:emoji:>",
      description: "Gets the information of the emoji provided. Useful for making bot resources.",
      process: function(msg, args) {
        var argArr = args.split(' ');
        var foundEmoji = Discord.Util.parseEmoji(argArr[0]);
        var emojiType = ""
        if (!argArr[0]) return msg.channel.send(`${msg.author.username}, please provide an emoji as a proper argument`);
        if(foundEmoji.id == null) return msg.channel.send(`${msg.author.username}, That's not a valid emoji`);
        if (foundEmoji.animated == true) {
          var emojiType = "gif";
        } else {
          var emojiType = "png";
        }
        const embed = new Discord.RichEmbed()
          .setAuthor(foundEmoji.name)
          .addField("Emoji ID:", `${foundEmoji.id}`)
          .addField("Link to Emoji:", `[Click Here](https://cdn.discordapp.com/emojis/${foundEmoji.id}.${emojiType})`)
          .setImage(`https://cdn.discordapp.com/emojis/${foundEmoji.id}.${emojiType}`)
          .setColor("RANDOM")
        msg.channel.send({embed});
      }
    },

    "emojilist": {
      usage: "",
      description: "Gets a list of every emoji in a guild",
      process: function(msg, suffix) {
        if(msg.channel.type !== 'text') return msg.channel.send("You can't use this command in DMs!");
        var emoji = msg.guild.emojis.map(e=>e.toString()).join(" ");
        const embed = new Discord.RichEmbed()
          .setDescription(emoji)
          .setColor("50E3C2")
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
           .addField("Member Count:", `${msg.guild.memberCount} members`)
           .addField("Owner", msg.guild.owner.user.tag)
           .setThumbnail(msg.guild.iconURL)
           .setColor("RANDOM")
         msg.channel.send({embed});
       }
    }
  }
}