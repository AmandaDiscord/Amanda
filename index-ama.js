process.title = "Amanda";
const fs = require("fs");
const Config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const Auth = JSON.parse(fs.readFileSync("./auth.json", "utf8"));
const { exec } = require("child_process");
const sql = require("sqlite");
const utils = require("bot-utils");
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
