module.exports = function(passthrough) {
  const {Discord, djs, dio} = passthrough;
  return {
    "invite": {
      usage: "",
      description: "Sends the bot invite link to chat",
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setDescription("<:discord:419242860156813312> **I've been invited?**\n*Be sure that you have administrator permissions on the server you would like to invite me to*")
          .setTitle("Invite Link")
          .setURL("http://amanda.discord-bots.ga/")
          .setFooter("Amanda", djs.user.avatarURL)
          .setColor(504277)
        msg.channel.send({embed});
      }
    },

    "info": {
      usage: "",
      description: "Displays information about the bot",
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setAuthor("Information:")
          .setColor(0x00AE86)
          .setDescription("Thank you for choosing me as your companion :heart: Here's a little bit of info about me.")
          .addField("Creator:", "PapiOphidian#8685 <:HypeBadge:421764718580203530> <:NitroBadge:421774688507920406>")
          .addField("Bot Version:", "4.3.5")
          .addField("Lang:", `Node.js ${process.version}`)
          .addField("Library:", "[Dualcord](https://www.npmjs.com/package/dualcord)")
          .addField("Description:", "A cutie-pie chat bot that only wishes for some love.")
          .addField("More Info:", "Visit Amanda's [website](http://amanda.shodanbot.com) or her [support server](http://papishouse.discords.ga)")
          .addBlankField(true)
          .addField("Partners:", "axelgreavette <:HypeBadge:421764718580203530>\n[SHODAN](http://shodanbot.com)<:bot:412413027565174787>")
          .setFooter("Amanda", djs.user.avatarURL)
          .setColor(504277)
        msg.channel.send({embed});
      }
    },

    "privacy": {
      usage: "",
      description: "Details Amanda's privacy statement",
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setAuthor("Privacy")
          .setDescription("Amanda promises to never log your messages anywhere. Amanda has no analytics outside of functions from within the Discord API; This means that how YOU use Amanda won't be displayed to other people nor will how all of the users who use Amanda be used for analytics")
          .setFooter("Amanda", djs.user.avatarURL)
          .setColor("21FB5C")
        msg.channel.send({embed});
      }
    }
  }
}