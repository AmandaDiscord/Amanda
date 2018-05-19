process.title = "Amanda";
const Config = require("./config.json");
const Auth = require("./auth.json");
const { exec } = require("child_process");
const sql = require("sqlite");
const utils = require("bot-utils");
const os = require("os");
const events = require("events");
let reloadEvent = new events.EventEmitter();
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
    console.error(reason)
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
      if (["320067006521147393", "366385096053358603", "176580265294954507","220625669032247296"].includes(msg.author.id))  {
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
        const embed = new Discord.RichEmbed()
          .setAuthor("Command Categories:")
          .setDescription(`❯ Core\n❯ Statistics\n❯ Gambling\n❯ Guild\n❯ Fun\n❯ Search\n❯ Images\n❯ Music\n❯ NSFW\n\n:information_source: **Typing \`${Config.commandPrefix}commands <category>\` will get you a list of all of the commands in that category. Ex: \`${Config.commandPrefix}commands core\`. Also typing \`${Config.commandPrefix}commands all\` will return all of the available commands**`)
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
          .setDescription(`${Config.commandPrefix}give <amount> <user>\n${Config.commandPrefix}coins <user>\n${Config.commandPrefix}slot <amount>\n${Config.commandPrefix}flip\n${Config.commandPrefix}bf <amount> <side>\n${Config.commandPrefix}lb\n${Config.commandPrefix}mine\n${Config.commandPrefix}dice`)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else if (suffix.toLowerCase() == "guild") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Guild command list:`)
          .addField(`**Moderation:**`, `${Config.commandPrefix}tidy <# to delete>`)
          .addField(`**Information:**`, `${Config.commandPrefix}guild\n${Config.commandPrefix}user <user>\n${Config.commandPrefix}emoji <:emoji:>\n${Config.commandPrefix}emojilist\n${Config.commandPrefix}wumbo <:emoji>`)
          .addField(`**Interaction:**`, `${Config.commandPrefix}poke <user>\n${Config.commandPrefix}boop <user>\n${Config.commandPrefix}hug <user>\n${Config.commandPrefix}cuddle <user>\n${Config.commandPrefix}pat <user>\n${Config.commandPrefix}kiss <user>\n${Config.commandPrefix}slap <user>\n${Config.commandPrefix}stab <user>\n${Config.commandPrefix}nom <user>`)
          .setColor('36393E')
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else if (suffix.toLowerCase() == "fun") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Fun command list:`)
          .setDescription(`${Config.commandPrefix}trivia <play / categories>\n${Config.commandPrefix}norris\n${Config.commandPrefix}randnum <min#> <max#>\n${Config.commandPrefix}yn <question>\n${Config.commandPrefix}ball <question>\n${Config.commandPrefix}rate <thing to rate>`)
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
      } else if (suffix.toLowerCase() == "music") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Music command list`)
          .setDescription(`${Config.commandPrefix}music\n\n**Arguments:**`)
          .addField(`First:`, `<join> - Joins the VC if you're in one\n<leave> - Leaves the VC\n<play> - Plays the current queue or adds songs to it\n<skip> - Skips the currently playing song\n<purge> - Purges the queue\n<now> - Shows what song is playing\n<queue> - Shows the entire queue`)
          .addField(`Second:`, `<url> - Any valid YouTube url`)
        msg.author.send({embed}).catch(() => msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`));
      } else if (suffix.toLowerCase() == "all") {
        const embed = new Discord.RichEmbed()
          .setAuthor(`Full command list`)
          .addField(`**❯ Core:**`, `${Config.commandPrefix}help <command>\n${Config.commandPrefix}commands <category>\n${Config.commandPrefix}invite\n${Config.commandPrefix}info\n${Config.commandPrefix}privacy`)
          .addField(`**❯ Statistics:**`, `${Config.commandPrefix}ping\n${Config.commandPrefix}uptime\n${Config.commandPrefix}stats`)
          .addField(`**❯ Gambling:**`, `${Config.commandPrefix}give <amount> <user>\n${Config.commandPrefix}coins <user>\n${Config.commandPrefix}slot <amount>\n${Config.commandPrefix}flip\n${Config.commandPrefix}bf <amount> <side>\n${Config.commandPrefix}lb\n${Config.commandPrefix}mine\n${Config.commandPrefix}dice`)
          .addField(`**❯ Guild:**`, `**Moderation:**\n${Config.commandPrefix}ban <user>\n${Config.commandPrefix}hackban <id>\n${Config.commandPrefix}kick <user>\n${Config.commandPrefix}tidy <# to delete>\n**Information:**\n${Config.commandPrefix}guild\n${Config.commandPrefix}user <user>\n${Config.commandPrefix}emoji <:emoji:>\n${Config.commandPrefix}emojilist\n${Config.commandPrefix}wumbo <:emoji:>\n**Interaction:**\n${Config.commandPrefix}poke <user>\n${Config.commandPrefix}boop <user>\n${Config.commandPrefix}hug <user>\n${Config.commandPrefix}cuddle <user>\n${Config.commandPrefix}pat <user>\n${Config.commandPrefix}kiss <user>\n${Config.commandPrefix}slap <user>\n${Config.commandPrefix}stab <user>\n${Config.commandPrefix}nom <user>`)
          .addField(`**❯ Fun:**`, `${Config.commandPrefix}trivia <play / categories>\n${Config.commandPrefix}norris\n${Config.commandPrefix}randnum <min#> <max#>\n${Config.commandPrefix}yn <question>\n${Config.commandPrefix}ball <question>\n${Config.commandPrefix}rate <thing to rate>`)
          .addField(`**❯ Search:**`, `${Config.commandPrefix}urban <search terms>`)
          .addField(`**❯ Images:**`, `${Config.commandPrefix}cat\n${Config.commandPrefix}dog\n${Config.commandPrefix}space`)
          .addField(`**❯ Music:**`, `${Config.commandPrefix}music - see \`${Config.commandPrefix}commands music\` for help`)
          .addField(`**❯ NSFW:**`, `Null`)
          .setColor('36393E')
          .setFooter("Old Amanda help pane", djs.user.avatarURL)
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
    let result = await eval(input);
    if (!result) return result
    console.log(util.inspect(result).replace(new RegExp(Auth.bot_token,"g"),"No"));
  } catch (e) {
      console.log("Error in eval.\n"+e.stack, "responseError");
  }
});
