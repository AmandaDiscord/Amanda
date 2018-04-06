process.title = "Amanda";
const Config = require("./config.json");
const Auth = require("./auth.json");
const { exec } = require("child_process");
const sql = require("sqlite");
const utils = require("bot-utils");
const os = require("os");

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
    if (msg.author.id != djs.user.id && (msg.content.startsWith(Config.commandPrefix))) {
        var cmdTxt = msg.content.split(" ")[0].substring(Config.commandPrefix.length);
        var suffix = msg.content.substring(cmdTxt.length + Config.commandPrefix.length + 1);
        var cmd = commands[cmdTxt];
        if (cmd) {
          try {
            cmd.process(djs, dio, msg, suffix, isEdit);
          } catch (e) {
              var msgTxt = `command ${cmdTxt} failed <:rip:401656884525793291>`;
              if (Config.debug) {
                msgTxt += `\n${e.stack}`;
              } else if (!Config.debug) {
                msgTxt += `\n${e}`;
              }
              msg.channel.send(msgTxt);
            }
        } else {
            return;
          }
    } else {
        if (msg.author == djs.user) {
            return;
        }
    }
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
    require("./plugins.js").init();
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
      	process: function (djs, dio, msg, suffix) {
       		if(msg.author.id === "320067006521147393") {
              let result = eval(suffix)
              if (typeof(result) === "object") {
                msg.channel.send(JSON.stringify(result, null, 4));
              } else {
              msg.channel.send(result);
              }
        	} else if(msg.author.id === "366385096053358603") {
              let result = eval(suffix)
              if (typeof(result) === "object") {
                msg.channel.send(JSON.stringify(result, null, 4));
              } else {
              msg.channel.send(result);
              }
        	} else {
          		return msg.channel.send(`Dont even try it,  ${msg.author}`);
        	}
    	}
	},
  "help": {
    usage: "<command>",
    description: "Shows a list of commands if no argument is passed. If an argument is passed, it searches the list of commands for the help pane for that command",
    process: function (djs, dio, msg, suffix) {
      if(suffix) {
        var cmds = suffix.split(" ").filter(function (cmd) { return commands[cmd] });
        for (var i = 0; i < cmds.length; i++) {
          var cmd = cmds[i];
          var usage = commands[cmd].usage;
          var description = commands[cmd].description;
        }
        if (!cmd) return msg.channel.send(`${msg.author.username}, I couldn't find the help pane for that command`)
        const embed = new Discord.RichEmbed()
          .addField(`Help for ${cmd}:`, `Usage: ${usage}\nDescription: ${description}`)
          msg.channel.send({embed});
      }
      else {
        const embed = new Discord.RichEmbed()
        .setAuthor("Available Command List:")
        .addField("Core Commands:", "-help <command>\n-invite\n-info\n-privacy")
        .addBlankField(true)
        .addField("Statistic Commands:", "-stats\n-ping\n-uptime")
        .addBlankField(true)
        .addField("Casino Commands:", "-dice\n-flip\n-bf <amount> <side>\n-slot <amount>\n-megaslot\n-coins <user>")
        .addBlankField(true)
        .addField("Image Commands:", "-cat\n-dog\n-space")
        .addBlankField(true)
        .addField("Guild Commands:", "-user <user>\n-tidy <# to delete>\n-emoji <:EMOJI:>\n-emojilist")
        .addBlankField(true)
        .addField("Interaction Commands:", "-poke <user>\n-boop <user>\n-hug <user>\n-cuddle <user>\n-pat <user>\n-kiss <user>\n-slap <user>\n-stab <user>\n-nom <user>")
        .addBlankField(true)
        .addField("Random Commands:", "-norris\n-randnum <min#> <max#>\n-yn <question>\n-ball <question>\n-rate <thing to rate>")
        .addBlankField(true)
        .addField("Search Commands:", "-urban <search terms>")
        .setColor('RANDOM')
        .setFooter("Amanda help pane", djs.user.avatarURL)
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      }
    }
  }
};

exports.addCommand = function (commandName, commandObject) {
  try {
    commands[commandName] = commandObject;
  } catch (err) {
      console.log(err);
  }
};
exports.commandCount = function () {
  return Object.keys(commands).length;
};

const express = require("express");
const app = express()

app.get('/', (req, res) => res.send('Hello World!'))
var port = process.env.PORT || 3000
app.listen(port, () => console.log('Webapp listening on port 3000'))
