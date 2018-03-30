exports.commands = [
  "uptime",
  "stats",
  "ping",
  "servers",
]

const Discord = require("discord.js");
const utils = require("bot-utils");
const os = require("os");

exports.uptime = {
  usage: "",
  description: "returns the amount of time since the bot and the system's operating system started",
  process: function(djs, dio, msg, suffix) {
    var uptime = utils.uptime();
    var osUptime = utils.osUptime()
    const embed = new Discord.RichEmbed()
      .setAuthor("Uptime", djs.user.avatarURL)
      .addField(":arrow_up: Bot Uptime:", `${uptime}`)
      .addField(":arrow_up: OS Uptime", `${osUptime}`)
      .setFooter("And still going")
    return msg.channel.send({embed});
  }
},

exports.stats = {
  usage: "",
  description: "Displays detailed statistics of the bot",
  process: function(djs, dio, msg, args) {
    var argArr = args.split(' ');
    var CPUClock = Date.now();
    var CPUTimeTaken = Date.now() - CPUClock
    var botPing = djs.ping.toFixed(0)
    var uptime = utils.uptime();
    var osUptime = utils.osUptime()
    var ramUsage = ((process.memoryUsage().heapUsed / 1024) / 1024).toFixed(2);
    const embed = new Discord.RichEmbed()
      .setAuthor("Statistics", djs.user.avatarURL)
      .addField(":cloud: Network Latency:", `${botPing}ms`)
      .addField(":arrow_up: Bot Uptime:", `${uptime}`)
      .addField("<:cpu:402219509915713537> OS:", `**Uptime:**\n${osUptime}\n**RAM Usage:**\n${ramUsage}MB`)
      .addField("<:Users:420035116866338826> User Count:", `${djs.users.size} users`)
      .addField("<:discord:419242860156813312> Guild Count:", `${djs.guilds.size} guilds`)
      .addField("<:terminal:419242860395757608> Channel Count:", `${djs.channels.size} channels`)
      .setFooter(`Requested by ${msg.author.username}`)
      .setColor(0x00AE86)
    return msg.channel.send({embed});
  }
},

exports.ping = {
  usage: "",
  description: "Tests the bot's network latency.",
  process: function (djs, dio, msg, args) {
    var npingArray = ["So young... So damaged...", "We've all got no where to go...","You think you have time...", "Only answers to those who have known true despair...", "Hopeless...", "Only I know what will come tomorrow...", "So dark... So deep... The secrets that you keep...", "Truth is false...", "Despair..."];
    var randnPingMsg = npingArray[Math.floor(Math.random() * npingArray.length)];
    const embed = new Discord.RichEmbed()
      .setAuthor("Pong!", djs.user.avatarURL)
      .addField(":cloud: Network Latency:", `${djs.ping.toFixed(0)}ms`)
      .setColor('RANDOM')
      .setFooter("Is that slow?")
    msg.channel.send(randnPingMsg).then(nmsg => nmsg.edit({embed}))
  }
},

exports.servers = {
  usage: "",
  description: "Tells you what servers the bot is in if you are the bot owner. Else, returns the amount of servers.",
  process: function(djs, dio, msg) {
    if(msg.author.id === "320067006521147393") {
      const embed = new Discord.RichEmbed()
        .setAuthor("Servers")
        .addField(`${djs.user.username} in currently in:`, `**${djs.guilds.map(g => `${g.name} - **${g.memberCount} Members**`).join(`\n`)}`, true)
        return msg.channel.send({embed});
    } else {
      return msg.channel.send(`${djs.user.username} is currently in ${djs.guilds.size} servers`);
    }
  }
}
