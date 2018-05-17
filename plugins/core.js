const utils = require("bot-utils");
const os = require("os");

module.exports = function(passthrough) {
  const {Discord, djs, dio} = passthrough;
  return {
    "uptime": {
      usage: "",
      description: "returns the amount of time since the bot and the system's operating system started",
      process: function(msg, suffix) {
        var uptime = utils.uptime();
        const embed = new Discord.RichEmbed()
          .setAuthor("Uptime")
          .addField("❯ Bot Uptime:", `${uptime}`)
          .setFooter("And still going")
          .setColor("36393E")
        msg.channel.send({embed});
      }
    },

    "stats": {
      usage: "",
      description: "Displays detailed statistics of the bot",
      process: function(msg, suffix) {
        var CPUClock = Date.now();
        var CPUTimeTaken = Date.now() - CPUClock
        var botPing = djs.ping.toFixed(0)
        var uptime = utils.uptime();
        var ramUsage = ((process.memoryUsage().heapUsed / 1024) / 1024).toFixed(2);
        const embed = new Discord.RichEmbed()
          .setAuthor("Statistics")
          .addField("❯ Network Latency:", `${botPing}ms`)
          .addField("❯ Bot Uptime:", `${uptime}`)
          .addField("❯ RAM Usage:", `${ramUsage}MB`)
          .addField("❯ User Count:", `${djs.users.size} users`)
          .addField("❯ Guild Count:", `${djs.guilds.size} guilds`)
          .addField("❯ Channel Count:", `${djs.channels.size} channels`)
          .setFooter(`Requested by ${msg.author.username}`)
          .setColor("36393E")
        return msg.channel.send({embed});
      }
    },

    "ping": {
      usage: "",
      description: "Tests the bot's network latency.",
      process: function (msg, args) {
        var npingArray = ["So young... So damaged...", "We've all got no where to go...","You think you have time...", "Only answers to those who have known true despair...", "Hopeless...", "Only I know what will come tomorrow...", "So dark... So deep... The secrets that you keep...", "Truth is false...", "Despair..."];
        var randnPingMsg = npingArray[Math.floor(Math.random() * npingArray.length)];
        const embed = new Discord.RichEmbed()
          .setAuthor("Pong!")
          .addField("❯ Network Latency:", `${djs.ping.toFixed(0)}ms`)
          .setFooter("Is that slow?")
          .setColor("36393E")
        msg.channel.send(randnPingMsg).then(nmsg => nmsg.edit({embed}))
      }
    },

    "servers": {
      usage: "",
      description: "Tells you what servers the bot is in if you are the bot owner. Else, returns the amount of servers.",
      process: function(msg) {
        if(msg.author.id === "320067006521147393") {
          const embed = new Discord.RichEmbed()
            .setAuthor("Servers")
            .addField(`${djs.user.username} in currently in:`, `**${djs.guilds.map(g => `${g.name} - **${g.memberCount} Members**`).join(`\n`)}`, true)
            .setColor("F8E71C")
            return msg.channel.send({embed});
        } else {
          return msg.channel.send(`${djs.user.username} is currently in ${djs.guilds.size} servers`);
        }
      }
    },

    "invite": {
      usage: "",
      description: "Sends the bot invite link to chat",
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setDescription("<:discord:419242860156813312> **I've been invited?**\n*Be sure that you have administrator permissions on the server you would like to invite me to*")
          .setTitle("Invite Link")
          .setURL("http://amanda.discord-bots.ga/")
          .setFooter("Amanda", djs.user.avatarURL)
          .setColor("36393E")
        msg.channel.send({embed});
      }
    },

    "info": {
      usage: "",
      description: "Displays information about the bot",
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setAuthor("Information:")
          .setColor("36393E")
          .setDescription("Thank you for choosing me as your companion :heart: Here's a little bit of info about me.")
          .addField("Creator:", "PapiOphidian#8685 <:HypeBadge:421764718580203530> <:NitroBadge:421774688507920406>")
          .addField("Bot Version:", "4.3.5")
          .addField("Lang:", `Node.js ${process.version}`)
          .addField("Library:", "[Dualcord](https://www.npmjs.com/package/dualcord)")
          .addField("Description:", "A cutie-pie chat bot that only wishes for some love.")
          .addField("More Info:", "Visit Amanda's [website](https://amandabot.ga/) or her [support server](http://papishouse.discords.ga)")
          .addBlankField(true)
          .addField("Partners:", "axelgreavette <:HypeBadge:421764718580203530>\n[SHODAN](http://shodanbot.com) <:bot:412413027565174787>\ncloudrac3r <:NitroBadge:421774688507920406>\n[botrac4r](https://discordapp.com/oauth2/authorize?client_id=353703396483661824&scope=bot) <:bot:412413027565174787>")
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
          .setColor("36393E")
        msg.channel.send({embed});
      }
    }
  }
}
