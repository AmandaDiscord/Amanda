const utils = require("bot-utils");
const os = require("os");

module.exports = function(passthrough) {
  const {Discord, djs, dio} = passthrough;
  return {
    "uptime": {
      usage: "",
      description: "Returns the amount of time since Amanda and her operating system has started",
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setAuthor("Uptime")
          .addField("❯ Bot Uptime:", `${utils.uptime()}`)
          .addField("❯ OS Uptime:", `${utils.osUptime()}`)
          .setFooter("And still going")
          .setColor("36393E")
        msg.channel.send({embed});
      }
    },

    "stats": {
      usage: "",
      description: "Displays detailed statistics of Amanda",
      process: function(msg, suffix) {
        var ramUsage = ((process.memoryUsage().heapUsed / 1024) / 1024).toFixed(2);
        const embed = new Discord.RichEmbed()
          .setAuthor("Statistics")
          .addField("❯ API Latency:", `${djs.ping.toFixed(0)}ms`)
          .addField(`❯ Message Latency:`, `${Date.now() - msg.createdTimestamp}ms`)
          .addField("❯ Bot Uptime:", `${utils.uptime()}`)
          .addField("❯ OS Uptime:", `${utils.osUptime()}`)
          .addField("❯ RAM Usage:", `${ramUsage}MB`)
          .addField("❯ User Count:", `${djs.users.size} users`)
          .addField("❯ Guild Count:", `${djs.guilds.size} guilds`)
          .addField("❯ Channel Count:", `${djs.channels.size} channels`)
          .setFooter(`Requested by ${msg.author.username}`)
          .setColor("36393E")
        msg.channel.send({embed});
      }
    },

    "ping": {
      usage: "",
      description: "Tests the bot's network latency.",
      process: function (msg, suffix) {
        var pingArray = ["So young... So damaged...", "We've all got no where to go...","You think you have time...", "Only answers to those who have known true despair...", "Hopeless...", "Only I know what will come tomorrow...", "So dark... So deep... The secrets that you keep...", "Truth is false...", "Despair..."];
        var randPingMsg = pingArray[Math.floor(Math.random() * pingArray.length)];
        const embed = new Discord.RichEmbed()
          .setAuthor("Pong!")
          .addField("❯ API Latency:", `${djs.ping.toFixed(0)}ms`)
          .addField(`❯ Message Latency:`, `${Date.now() - msg.createdTimestamp}ms`)
          .setFooter("Is that slow?")
          .setColor("36393E")
        msg.channel.send(randPingMsg).then(nmsg => nmsg.edit({embed}));
      }
    },

    "servers": {
      usage: "",
      description: "Returns the amount of servers the bot is in",
      process: function(msg) {
        if(msg.author.id === "320067006521147393") {
          const embed = new Discord.RichEmbed()
            .setAuthor("Servers")
            .addField(`${djs.user.username} in currently in:`, `**${djs.guilds.map(g => `${g.name} - **${g.memberCount} Members**`).join(`\n`)}`, true)
            .setColor("F8E71C")
          msg.channel.send({embed});
        } else msg.channel.send(`${djs.user.username} is currently in ${djs.guilds.size} servers`);
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
      description: "Displays information about Amanda",
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setAuthor("Information:")
          .setColor("36393E")
          .setDescription("Thank you for choosing me as your companion :heart: Here's a little bit of info about me.")
          .addField("Creator:", "PapiOphidian#8685 <:HypeBadge:421764718580203530> <:NitroBadge:421774688507920406>")
          .addField("Lang:", `Node.js ${process.version}`)
          .addField("Library:", "[Dualcord](https://www.npmjs.com/package/dualcord)")
          .addField("Description:", "A cutie-pie general purpose bot that only wishes for some love.")
          .addField("More Info:", "Visit Amanda's [website](https://amandabot.ga/) or her [support server](http://papishouse.discords.ga)")
          .addBlankField(true)
          .addField("Partners:", "axelgreavette <:HypeBadge:421764718580203530>\n[SHODAN](http://shodanbot.com) <:bot:412413027565174787>\n[cloudrac3r](https://cadence.gq/) <:NitroBadge:421774688507920406>\n[botrac4r](https://discordapp.com/oauth2/authorize?client_id=353703396483661824&scope=bot) <:bot:412413027565174787>")
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
          .setDescription("Amanda collects basic user information which includes, but is not limited to, usernames and discriminators, profile pictures and their urls and user Snowflakes/IDs. This information is solely used to bring you content relevant to the command executed and that data is not stored anywhere outside of the bot's cache. In other words, only data that's needed which is relevant to the command is being used and your information or how you use the bot is not collected and sent to external places for others to see. That's a promise. If you do not want your information to be used by the bot, remove it from your servers and do not use it")
          .setFooter("Amanda", djs.user.avatarURL)
          .setColor("36393E")
        msg.channel.send({embed});
      }
    }
  }
}
