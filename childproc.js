process.title = "PingBot";
const Config = {
  "commandPrefix": "!",
  "debug": false
}
const { exec } = require("child_process");
console.log(`Starting...\nYour Node.js version is: ${process.version}`);

const Discord = require('discord.js');
const discordClient = require("dualcord");
const client = new discordClient();
client.login({token: Mzk1MzE0NDU3Njc4NDQ2NTkz.DSW8lQ.jbt3cdct0UiZ9WeTe7Wll9K7uAQ});
const dio = client.dioClient();
const djs = client.djsClient();
console.log(`Your Discord.js version is: ${Discord.version}`);

process.on("unhandledRejection", (reason) => {
  console.error(reason);
});

function checkMessageForCommand(msg, isEdit) {
  if (msg.author.id != djs.user.id && (msg.content.startsWith(Config.commandPrefix))) {
    var cmdTxt = msg.content.split(" ")[0].substring(Config.commandPrefix.length);
    var suffix = msg.content.substring(cmdTxt.length + Config.commandPrefix.length + 1);
    var cmd = commands[cmdTxt];
    if (cmd) {
      try {
        cmd.process(djs, dio, msg, suffix, isEdit);
      } catch (e) {
        var msgTxt = `command ${cmdTxt} failed`;
        if (Config.debug) {
          msgTxt += `\n${e.stack}`;
        }
        if (!Config.debug) {
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
djs.on("message", msg => checkMessageForCommand(msg, false));
djs.on("messageUpdate", (oldMessage, newMessage) => {
  checkMessageForCommand(newMessage, true);
});


// Presence update
const presences = [
  ['around', 'PLAYING'],
  ['people get pinged endlessly', 'WATCHING'],
  ['ping noises going off', 'LISTENING'],
];
const update = () => {
	const [name, type] = presences[Math.floor(Math.random() * presences.length)];
	djs.user.setActivity(`${name} !ping`, { type, url: 'https://www.twitch.tv/papiophidian/' });
};
djs.on('ready', () => {
	console.log("Successfully logged in.");
  update();
  djs.setInterval(update, 300000);
});
djs.on("disconnected", function () {
  console.log("Disconnected!");
});

const commands = {
	 "eval": {
     usage: "<code>",
     description: "Executes arbitrary javascript in the bot process. Requires bot owner permissions.",
     process: function (djs, dio, msg, suffix) {
      if(["320067006521147393"].includes(msg.author.id)) {
        let result = eval(suffix)
        if (typeof(result) === "object") {
          msg.channel.send(JSON.stringify(result, null, 4));
        } else {
        msg.channel.send(result);
        }
    	} else {
      	msg.channel.send(`Dont even try it, ${msg.author}`);
    	}
    }
	},
  "ping": {
    usage: "<user or role>",
    description: "Pings the ever living shit out of someone. 100 times to be exact",
    process: function(djs, dio, msg, suffix) {
      if (!suffix) return msg.channel.send("You have to tell me who to ping!");
      var i = 0; do {i++; msg.channel.send(`${i}. ${suffix}`)} while (i < 100);
    }
  }
};

const express = require("express");
const app = express()

app.get('/', (req, res) => res.send('Hello World!'))
var port = process.env.PORT || 3000
app.listen(port, () => console.log('Webapp listening on port 3000'))
