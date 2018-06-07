const fs = require("fs");
const Config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const Auth = JSON.parse(fs.readFileSync("./auth.json", "utf8"));
const os = require("os");
const util = require("util");
const { exec } = require("child_process");

module.exports = function(passthrough) {
  const {Discord, djs, dio, dbs, utils, commands} = passthrough;
  let sql = dbs[0];
  return {
    "uptime": {
      usage: "",
      description: "Returns the amount of time since Amanda and her operating system has started",
      aliases: ["uptime"],
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setAuthor("Uptime")
          .addField("❯ Bot Uptime:", `${utils.humanize(process.uptime(), "sec")}`)
          .setFooter("And still going")
          .setColor("36393E")
        msg.channel.send({embed});
      }
    },

    "stats": {
      usage: "",
      description: "Displays detailed statistics of Amanda",
      aliases: ["stats"],
      process: function(msg, suffix) {
        var ramUsage = ((process.memoryUsage().heapUsed / 1024) / 1024).toFixed(2);
        const embed = new Discord.RichEmbed()
          .setAuthor("Statistics")
          .addField("❯ API Latency:", `${djs.ping.toFixed(0)}ms`)
          .addField(`❯ Message Latency:`, `${Date.now() - msg.createdTimestamp}ms`)
          .addField("❯ Bot Uptime:", `${utils.humanize(process.uptime(), "sec")}`)
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
      aliases: ["ping", "pong"],
      process: async function (msg, suffix) {
        var pingArray = ["So young... So damaged...", "We've all got no where to go...","You think you have time...", "Only answers to those who have known true despair...", "Hopeless...", "Only I know what will come tomorrow...", "So dark... So deep... The secrets that you keep...", "Truth is false...", "Despair..."];
        var randPingMsg = pingArray[Math.floor(Math.random() * pingArray.length)];
        const embed = new Discord.RichEmbed()
          .setAuthor("Pong!")
          .addField("❯ API Latency:", `${djs.ping.toFixed(0)}ms`)
          .addField(`❯ Message Latency:`, `${Date.now() - msg.createdTimestamp}ms`)
          .setFooter("Is that slow?")
          .setColor("36393E")
        var nmsg = await msg.channel.send(randPingMsg);
        nmsg.edit({embed});
      }
    },

    "invite": {
      usage: "",
      description: "Sends the bot invite link to chat",
      aliases: ["invite", "inv"],
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setDescription("<:discord:419242860156813312> **I've been invited?**\n*Be sure that you have administrator permissions on the server you would like to invite me to*")
          .setTitle("Invite Link")
          .setURL("http://amanda.discord-bots.ga/")
          .setFooter("Amanda", djs.user.avatarURL)
          .setColor("36393E")
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      }
    },

    "info": {
      usage: "",
      description: "Displays information about Amanda",
      aliases: ["info", "inf"],
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
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      }
    },

    "privacy": {
      usage: "",
      description: "Details Amanda's privacy statement",
      aliases: ["privacy"],
      process: function(msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setAuthor("Privacy")
          .setDescription("Amanda collects basic user information which includes, but is not limited to, usernames and discriminators, profile pictures and their urls and user Snowflakes/IDs. This information is solely used to bring you content relevant to the command executed and that data is not stored anywhere where it is not essential for the bot to operate. In other words, only data that's needed which is relevant to the command is being used and your information or how you use the bot is not collected and sent to external places for others to see. That's a promise. If you do not want your information to be used by the bot, remove it from your servers and do not use it")
          .setFooter("Amanda", djs.user.avatarURL)
          .setColor("36393E")
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      }
    },

    "commands": {
      usage: "<category>",
      description: "Shows the command list from a specific category of commands",
      aliases: ["commands", "cmds"],
      process: function(msg, suffix) {
        if (!suffix) return msg.channel.send(`${msg.author.username}, you must provide a command category as an argument`);
        if (suffix.toLowerCase() == "core") {
          const embed = new Discord.RichEmbed()
            .setAuthor(`Core command list:`)
            .setDescription(`&help <command>\n&commands <category>\n&invite\n&info\n&privacy`)
            .setColor('36393E')
          msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
        } else if (suffix.toLowerCase() == "statistics") {
          const embed = new Discord.RichEmbed()
            .setAuthor(`Statistics command list:`)
            .setDescription(`&ping\n&uptime\n&stats`)
            .setColor('36393E')
          msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
        } else if (suffix.toLowerCase() == "gambling") {
          const embed = new Discord.RichEmbed()
            .setAuthor(`Gambling command list:`)
            .setDescription(`&give <amount> <user>\n&coins <user>\n&slot <amount>\n&flip\n&bf <amount> <side>\n&lb\n&mine\n&dice\n&waifu <user>\n&claim <amount> <user>`)
            .setColor('36393E')
          msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
        } else if (suffix.toLowerCase() == "guild") {
          const embed = new Discord.RichEmbed()
            .setAuthor(`Guild command list:`)
            .addField(`**Moderation:**`, `&tidy <# to delete>`)
            .addField(`**Information:**`, `&guild\n&user <user>\n&emoji <:emoji:>\n&emojilist\n&wumbo <:emoji>`)
            .addField(`**Interaction:**`, `&poke <user>\n&boop <user>\n&hug <user>\n&cuddle <user>\n&pat <user>\n&kiss <user>\n&slap <user>\n&stab <user>\n&nom <user>\n&ship <user 1> <user 2>`)
            .setColor('36393E')
          msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
        } else if (suffix.toLowerCase() == "fun") {
          const embed = new Discord.RichEmbed()
            .setAuthor(`Fun command list:`)
            .setDescription(`&trivia <play / categories>\n&norris\n&yomamma\n&randnum <min#> <max#>\n&yn <question>\n&ball <question>\n&rate <thing to rate>`)
            .setColor('36393E')
          msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
        } else if (suffix.toLowerCase() == "search") {
          const embed = new Discord.RichEmbed()
            .setAuthor(`Search command list:`)
            .setDescription(`&urban <search terms>`)
            .setColor('36393E')
          msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
        } else if (suffix.toLowerCase() == "images") {
          const embed = new Discord.RichEmbed()
            .setAuthor(`Images command list:`)
            .setDescription(`&cat\n&dog\n&space\n&meme`)
            .setColor('36393E')
          msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
        } else if (suffix.toLowerCase() == "music") {
          const embed = new Discord.RichEmbed()
            .setAuthor(`Music command list`)
            .setDescription(`&music`)
            .addField(`Arguments:`, `<play> / Plays the current queue or adds songs to it\n- <url> / Any valid YouTube url\n---------------------------\n<skip> / Skips the currently playing song\n---------------------------\n<stop> / Purges the queue and leaves the voice channel\n---------------------------\n<now> / Shows what song is playing\n---------------------------\n<queue> / Shows the entire queue\n---------------------------\n<volume> / changes the volume of the music dispatcher\n- <# (5 is the default volume)>\n---------------------------\n<shuffle> / Randomly shuffles the current queue\n---------------------------\n<playlist> / Custom playlists made by users through Amanda\n<playlist name>\n- <add>\n-- <url>\n---------------------------\n- <remove>\n-- <# of position of song>\n---------------------------\n- <play>\n---------------------------\n- <move>\n-- <# of position of song to move>\n--- <# of position to move song to>\n\nEx for playlist: \`&music playlist xi play\``)
          msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
        } else if (suffix.toLowerCase() == "all") {
          const embed = new Discord.RichEmbed()
            .setAuthor(`Full command list`)
            .addField(`**❯ Core:**`, `&help <command>\n&commands <category>\n&invite\n&info\n&privacy`)
            .addField(`**❯ Statistics:**`, `&ping\n&uptime\n&stats`)
            .addField(`**❯ Gambling:**`, `&give <amount> <user>\n&coins <user>\n&slot <amount>\n&flip\n&bf <amount> <side>\n&lb\n&mine\n&dice\n&waifu <user>\n&claim <amount> <user>`)
            .addField(`**❯ Guild:**`, `**Moderation:**\n&ban <user>\n&hackban <id>\n&kick <user>\n&tidy <# to delete>\n**Information:**\n&guild\n&user <user>\n&emoji <:emoji:>\n&emojilist\n&wumbo <:emoji:>\n**Interaction:**\n&poke <user>\n&boop <user>\n&hug <user>\n&cuddle <user>\n&pat <user>\n&kiss <user>\n&slap <user>\n&stab <user>\n&nom <user>\n&ship <user 1> <user 2>`)
            .addField(`**❯ Fun:**`, `&trivia <play / categories>\n&norris\n&yomamma\n&randnum <min#> <max#>\n&yn <question>\n&ball <question>\n&rate <thing to rate>`)
            .addField(`**❯ Search:**`, `&urban <search terms>`)
            .addField(`**❯ Images:**`, `&cat\n&dog\n&space\n&meme`)
            .addField(`**❯ Music:**`, `&music - see \`&commands music\` for help`)
            //.addField(`**❯ NSFW:**`, `Null`)
            .setColor('36393E')
            .setFooter("Amanda help pane", `https://cdn.discordapp.com/avatars/${djs.user.id}/${djs.user.avatar}.png?size=32`)
          msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
        } else {
          const embed = new Discord.RichEmbed()
            .setDescription(`**${msg.author.tag}**, It looks like there isn't anything here but the almighty hipnotoad`)
            .setColor('36393E')
          msg.channel.send({embed});
        }
      }
    },

    "help": {
      usage: "<command>",
      description: "Shows a list of command categories if no argument is passed. If an argument is passed, it searches the list of commands for the help pane for that command",
      aliases: ["help", "h"],
      process: async function (msg, suffix) {
        if(suffix) {
          var cmd = Object.values(commands).find(c => c.aliases.includes(suffix));
          if (!cmd) {
            const embed = new Discord.RichEmbed()
              .setDescription(`**${msg.author.tag}**, I couldn't find the help pane for that command`)
              .setColor("B60000")
            return msg.channel.send({embed});
          }
          var usage = cmd.usage;
          var description = cmd.description;
          const embed = new Discord.RichEmbed()
            .addField(`Help for ${cmd.aliases[0]}:`, `Usage: ${usage}\nDescription: ${description}`)
          msg.channel.send({embed});
        } else {
          const embed = new Discord.RichEmbed() // \n❯ NSFW
            .setAuthor("Command Categories:")
            .setDescription(`❯ Core\n❯ Statistics\n❯ Gambling\n❯ Guild\n❯ Fun\n❯ Search\n❯ Images\n❯ Music\n\n:information_source: **Typing \`&commands <category>\` will get you a list of all of the commands in that category. Ex: \`&commands core\`. Also typing \`&commands all\` will return all of the available commands**`)
            .setFooter("Amanda help panel", djs.user.avatarURL)
            .setColor('36393E')
          try {
            await msg.author.send({embed});
          } catch (error) {
            return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`);
          }
          if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
        }
      }
    },

    "evaluate": {
      usage: "<code>",
      description: "Executes arbitrary JavaScript in the bot process. Requires bot owner permissions",
      aliases: ["evaluate", "eval"],
      process: async function (msg, suffix) {
        if (["320067006521147393", "366385096053358603", "176580265294954507"].includes(msg.author.id))  {
          let result = await eval(suffix);
          if (!result) return result
          msg.channel.send(util.inspect(result).replace(new RegExp(Auth.bot_token,"g"),"No"));
        } else {
          var nope = [["no", 300], ["Nice try", 1000], ["How about no?", 1550], [`Don't even try it ${msg.author.username}`, 3000]];
          var [no, time] = nope[Math.floor(Math.random() * nope.length)];
          msg.channel.startTyping();
          setTimeout(() => {
            msg.channel.send(no).then(() => msg.channel.stopTyping());
          }, time)
        }
      }
    }
  }
}
