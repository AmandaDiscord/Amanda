process.title = "Amanda";
const Config = require("./config.json");
const Auth = require("./auth.json");
const { exec } = require("child_process");
const sql = require("sqlite");
const utils = require("bot-utils");
const os = require("os");
const util = require("util");

const Discord = require('discord.js');
const discordClient = require("dualcord");
const client = new discordClient();
client.login({token: Auth.bot_token});
const dio = client.dioClient();
const djs = client.djsClient();

console.log(`Starting...\nYour Node.js version is: ${process.version}`);
console.log(`Your Discord.js version is: ${Discord.version}`);

process.on("unhandledRejection", (reason) => {
    console.error(reason);
});

async function checkMessageForCommand(msg, isEdit) {
    if (!msg.author.bot && (msg.content.startsWith(Config.commandPrefix))) {
        var cmdTxt = msg.content.split(" ")[0].substring(Config.commandPrefix.length);
        var suffix = msg.content.substring(cmdTxt.length + Config.commandPrefix.length + 1);
        var cmd = commands[cmdTxt];
        if (cmd) {
          try {
            await cmd.process(msg, suffix, isEdit);
          } catch (e) {
              var msgTxt = `command ${cmdTxt} failed <:rip:401656884525793291>`;
              if (Config.debug) {
                msgTxt += `\n${e.stack}`;
              } else if (!Config.debug) {
                msgTxt += `\n${e}`;
              }
              const embed = new Discord.RichEmbed()
                .setDescription(msgTxt)
                .setColor("B60000")
              msg.channel.send({embed});
            }
        } else return;
    } else return;
};
const presences = [
    ['alone', 'PLAYING'], ['in a box', 'PLAYING'], ['with fire', 'PLAYING'],
    ['anime', 'WATCHING'], ['Netflix', 'WATCHING'], ['YouTube', 'WATCHING'], ['bots take over the world', 'WATCHING'], ['endless space go by', 'WATCHING'],
    ['music', 'LISTENING'], ['Spootify', 'LISTENING'],
    ['with Shodan', 'STREAMING'],
];
const update = () => {
		const [name, type] = presences[Math.floor(Math.random() * presences.length)];
		djs.user.setActivity(`${name} | ${Config.commandPrefix}help`, { type, url: 'https://www.twitch.tv/papiophidian/' });
};
djs.on('ready', () => {
    loadCommands();
		console.log("Successfully logged in.");
    update();
    djs.setInterval(update, 300000);
    console.log(`${djs.user.username} is currently in ${djs.guilds.size} servers.`);
});
djs.on("disconnected", function () {
    console.log("Disconnected! Attempting to reconnect in 6 seconds.");
    setTimeout(function(){ client.login(Auth.bot_token); }, 6000);
});
djs.on("message", async msg => checkMessageForCommand(msg, false));
djs.on("messageUpdate", (oldMessage, newMessage) => {
    checkMessageForCommand(newMessage, true);
});

const commands = {
  "eval": {
    usage: "<code>",
    description: "Executes arbitrary JavaScript in the bot process. Requires bot owner permissions",
    process: async function (msg, suffix) {
      if (["320067006521147393", "366385096053358603"].includes(msg.author.id))  {
        let result = await eval(suffix);
        if (!result) return result
        msg.channel.send(util.inspect(result).replace(new RegExp(Auth.bot_token,"g"),"No"));
      } else {
        msg.channel.startTyping();
        setTimeout(() => {
          msg.channel.send(`Dont even try it, ${msg.author}`).then(() => msg.channel.stopTyping());
        }, 5000)
      }
    }
	},
  "help": {
    usage: "<command>",
    description: "Shows a list of command categories if no argument is passed. If an argument is passed, it searches the list of commands for the help pane for that command",
    process: function (msg, suffix) {
      if(suffix) {
        var cmds = suffix.split(" ").filter(function (cmd) { return commands[cmd] });
        for (var i = 0; i < cmds.length; i++) {
          var cmd = cmds[i];
          var usage = commands[cmd].usage;
          var description = commands[cmd].description;
        }
        if (!cmd) {
          const embed = new Discord.RichEmbed()
            .setDescription(`**${msg.author.tag}**, I couldn't find the help pane for that command`)
            .setColor("B60000")
          return msg.channel.send(`${msg.author.username}, I couldn't find the help pane for that command`)
        }
        const embed = new Discord.RichEmbed()
          .addField(`Help for ${cmd}:`, `Usage: ${usage}\nDescription: ${description}`)
          msg.channel.send({embed});
      }
      else {
        const embed = new Discord.RichEmbed()
          .setAuthor("Command Categories:")
          .setDescription(`❯ Core\n❯ Statistics\n❯ Gambling\n❯ Guild\n❯ Fun\n❯ Search\n❯ Images\n❯ Music\n❯ NSFW\n\n:information_source: **Typing \`${Config.commandPrefix}commands <category>\` will get you a list of all of the commands in that category. Ex: ${Config.commandPrefix}commands core**`)
          .setFooter("Amanda help pane", djs.user.avatarURL)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      }
    }
  },
  "commands": {
    usage: "<category>",
    description: "Shows the command list from a specific category of commands",
    process: function(msg, suffix) {
      if (!suffix) return msg.channel.send(`${msg.author.username}, you must provide a command category as an argument`);
      if (suffix.toLowerCase() == "core") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Core command list:`)
          .setDescription(`${Config.commandPrefix}help <command>\n${Config.commandPrefix}commands <category>\n${Config.commandPrefix}invite\n${Config.commandPrefix}info\n${Config.commandPrefix}privacy`)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else if (suffix.toLowerCase() == "statistics") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Statistics command list:`)
          .setDescription(`${Config.commandPrefix}ping\n${Config.commandPrefix}uptime\n${Config.commandPrefix}stats`)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else if (suffix.toLowerCase() == "gambling") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Gambling command list:`)
          .setDescription(`${Config.commandPrefix}coins <user>\n${Config.commandPrefix}slot <amount>\n${Config.commandPrefix}flip\n${Config.commandPrefix}bf <amount> <side>\n${Config.commandPrefix}lb\n${Config.commandPrefix}mine\n${Config.commandPrefix}dice`)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else if (suffix.toLowerCase() == "guild") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Guild command list:`)
          .addField(`**Moderation:**`, `${Config.commandPrefix}tidy <# to delete>`)
          .addField(`**Information:**`, `${Config.commandPrefix}guild\n${Config.commandPrefix}user <user>\n${Config.commandPrefix}emoji <:emoji:>\n${Config.commandPrefix}emojilist`)
          .addField(`**Interaction:**`, `${Config.commandPrefix}poke <user>\n${Config.commandPrefix}boop <user>\n${Config.commandPrefix}hug <user>\n${Config.commandPrefix}cuddle <user>\n${Config.commandPrefix}pat <user>\n${Config.commandPrefix}kiss <user>\n${Config.commandPrefix}slap <user>\n${Config.commandPrefix}stab <user>\n${Config.commandPrefix}nom <user>`)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else if (suffix.toLowerCase() == "fun") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Fun command list:`)
          .setDescription(`${Config.commandPrefix}norris\n${Config.commandPrefix}randnum <min#> <max#>\n${Config.commandPrefix}yn <question>\n${Config.commandPrefix}ball <question>\n${Config.commandPrefix}rate <thing to rate>`)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else if (suffix.toLowerCase() == "search") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Search command list:`)
          .setDescription(`${Config.commandPrefix}urban <search terms>`)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else if (suffix.toLowerCase() == "images") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Images command list:`)
          .setDescription(`${Config.commandPrefix}cat\n${Config.commandPrefix}dog\n${Config.commandPrefix}space`)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else {
        const embed = new Discord.RichEmbed()
          .setDescription(`**${msg.author.tag}**, It looks like there isn't anything here but the almighty hipnotoad`)
          .setColor('36393E')
        msg.channel.send({embed});
      }
    }
  }
};

const express = require("express");
const app = express()

app.get('/', (req, res) => res.send('Hello World!'))
var port = process.env.PORT || 3000
app.listen(port, () => console.log('Webapp listening on port 3000'))

function loadCommands() {
  let passthrough = {Discord, djs, dio};
  require("./plugins.js")(passthrough, loaded => {
    Object.assign(commands, loaded);
  });
}