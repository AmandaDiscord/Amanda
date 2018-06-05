process.title = "Amanda";
const fs = require("fs");
const Config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const Auth = JSON.parse(fs.readFileSync("./auth.json", "utf8"));
const { exec } = require("child_process");
const sql = require("sqlite");
const utils = require("./util/core-utils.js");
const os = require("os");
const events = require("events");
let reloadEvent = new events.EventEmitter();
const util = require("util")

const Discord = require('discord.js');
const discordClient = require("dualcord");
const client = new discordClient();
client.login({token: Auth.bot_token});
const dio = client.dioClient();
const djs = client.djsClient();

console.log(`Starting...\nYour Node.js version is: ${process.version}`);
console.log(`Your Discord.js version is: ${Discord.version}`);

process.on("unhandledRejection", (reason) => {
    console.error(reason)
});

async function checkMessageForCommand(msg, isEdit) {
  var prefix = Config.prefixes.find(p => msg.content.startsWith(p));
  if (!prefix) return;
  if (prefix == "<@405208699313848330>") {
    var cmdTxt = msg.content.slice("<@405208699313848330> ".length).split(" ")[0].substring();
    var suffix = msg.content.substring(cmdTxt.length + prefix.length + 2);
  } else {
    var cmdTxt = msg.content.split(" ")[0].substring(prefix.length);
    var suffix = msg.content.substring(cmdTxt.length + prefix.length + 1);
  }
  var cmd = commands[cmdTxt];
  if (cmd) {
    try {
      await cmd.process(msg, suffix, isEdit);
    } catch (e) {
      var msgTxt = `command ${cmdTxt} failed <:rip:401656884525793291>`;
      if (Config.debug) msgTxt += `\n${e.stack}`;
      else msgTxt += `\n${e}`;
      const embed = new Discord.RichEmbed()
        .setDescription(msgTxt)
        .setColor("B60000")
      msg.channel.send({embed});
    }
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
	djs.user.setActivity(`${name} | ${Config.prefixes[0]}help`, { type, url: 'https://www.twitch.tv/papiophidian/' });
};
djs.on('ready', () => {
  loadCommands();
	console.log("Successfully logged in.");
  update();
  djs.setInterval(update, 300000);
  console.log(`${djs.user.username} is currently in ${djs.guilds.size} servers.`);
});
djs.on("disconnect", reason => {
  console.log(`Disconnected with ${reason.code} at ${reason.path}\n\nReconnecting in 6sec`);
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
  },
  
  "help": {
    usage: "<command>",
    description: "Shows a list of command categories if no argument is passed. If an argument is passed, it searches the list of commands for the help pane for that command",
    process: async function (msg, suffix) {
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
          return msg.channel.send({embed});
        }
        const embed = new Discord.RichEmbed()
          .addField(`Help for ${cmd}:`, `Usage: ${usage}\nDescription: ${description}`)
        msg.channel.send({embed});
      }
      else {
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
  }
};

function loadCommands() {
  Promise.all([
    sql.open("./databases/money.sqlite"),
    sql.open("./databases/music.sqlite")
  ]).then(dbs => {
    let passthrough = {Discord, djs, dio, reloadEvent, dbs};
    require("./plugins.js")(passthrough, loaded => {
      Object.assign(commands, loaded);
    });
  });
}

let stdin = process.stdin;
stdin.on("data", async function(input) {
  input = input.toString();
  try {
    await eval(input);
  } catch (e) {
      console.log(e.stack);
  }
});

console.clear = function () {
  return process.stdout.write('\x1Bc');
}

async function handleAi(msg) {

}

var identqs = ["?", "who", "what", "when", "where", "why"];

var responses = {
  "questions": {

  },
  "answers": {

  },
  "facts": {

  }
}
