const utils = require("bot-utils");
const Canvas = require("canvas");
const util = require("util");
const fs = require("fs");

function findMember(msg, suffix, self = false) {
  if (!suffix) {
    if (self) return msg.member
    else return null
  } else {
    let member = msg.guild.members.find(m => m.user.tag.toLowerCase().includes(suffix.toLowerCase())) || msg.mentions.members.first() || msg.guild.members.get(suffix) || msg.guild.members.find(m => m.displayName.toLowerCase().includes(suffix.toLowerCase()) || m.user.username.toLowerCase().includes(suffix.toLowerCase()));
    return member
  }
}

module.exports = function(passthrough) {
  const {Discord, djs, dio} = passthrough;
  return {
    "hug": {
      usage: "<user>",
      description: "Hugs someone",
      process: function(msg, suffix) {
        var member = findMember(msg, suffix);
        if (member == null) return msg.channel.send("Couldn't find that user");
        if (msg.channel.type !== "text") return msg.channel.send("Why would you want to hug someone in DMs?");
        if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to hug`);
        if (member.user.id == msg.author.id) return msg.channel.send("That's not strange at all...");
        if (member.user.id == djs.user.id) return msg.channel.send(`**Hugs ${msg.author.username} back** :heart:`);
        require("request")("http://api.shodanbot.com/interactions/hug", function(err, res, body) {
          if (err) return msg.channel.send("Error... Api returned nothing");
          try {
            var data = JSON.parse(body);
          } catch (error) {
            return msg.channel.send(`There was an error:\n${error}`);
          }
          const embed = new Discord.RichEmbed()
            .setDescription(`${msg.author.username} hugged <@${member.user.id}>`)
            .setImage(data.img)
          msg.channel.send({embed});
        })
      }
    },

    "kiss": {
      usage: "<user>",
      description: "Kisses someone",
      process: function(msg, suffix) {
        var member = findMember(msg, suffix);
        if (member == null) return msg.channel.send("Couldn't find that user");
        if (msg.channel.type !== "text") return msg.channel.send("Why would you want to kiss someone in DMs?");
        if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to kiss`);
        if (member.user.id == msg.author.id) return msg.channel.send(`W-What? Why, ${msg.author.username}?`);
        if (member.user.id == djs.user.id) return msg.channel.send(`**Kisses ${msg.author.username} back** :heart:`);
        require("request")("http://api.shodanbot.com/interactions/kiss", function(err, res, body) {
          if (err) return msg.channel.send("Error... Api returned nothing");
          try {
            var data = JSON.parse(body);
          } catch (error) {
            return msg.channel.send(`There was an error:\n${error}`);
          }
          const embed = new Discord.RichEmbed()
            .setDescription(`${msg.author.username} kissed <@${member.user.id}>`)
            .setImage(data.img)
          msg.channel.send({embed});
        })
      }
    },

    "cuddle": {
      usage: "<user>",
      description: "Cuddles someone",
      process: function(msg, suffix) {
        var member = findMember(msg, suffix);
        if (member == null) return msg.channel.send("Couldn't find that user");
        if (msg.channel.type !== "text") return msg.channel.send("Why would you want to cuddle someone in DMs?");
        if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to cuddle`);
        if (member.user.id == msg.author.id) return msg.channel.send("I find it strange that you tried to do that...");
        if (member.user.id == djs.user.id) return msg.channel.send(`**Cuddles ${msg.author.username} back** :heart:`);
        require("request")("http://api.shodanbot.com/interactions/cuddle", function(err, res, body) {
          if (err) return msg.channel.send("Error... Api returned nothing");
          try {
            var data = JSON.parse(body);
          } catch (error) {
            return msg.channel.send(`There was an error:\n${error}`);
          }
          const embed = new Discord.RichEmbed()
            .setDescription(`${msg.author.username} cuddled <@${member.user.id}>`)
            .setImage(data.img)
          msg.channel.send({embed});
        })
      }
    },

    "poke": {
      usage: "<user>",
      description: "Pokes someone",
      process: function(msg, suffix) {
        var member = findMember(msg, suffix);
        if (member == null) return msg.channel.send("Couldn't find that user");
        if (msg.channel.type !== "text") return msg.channel.send("Why would you want to poke someone in DMs?");
        if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to poke`);
        if (member.user.id == msg.author.id) return msg.channel.send("Ok then...");
        if (member.user.id == djs.user.id) return msg.channel.send(`Don't poke me ; ^ ;`);
        require("request")("http://api.shodanbot.com/interactions/poke", function(err, res, body) {
          if (err) return msg.channel.send("Error... Api returned nothing");
          try {
            var data = JSON.parse(body);
          } catch (error) {
            return msg.channel.send(`There was an error:\n${error}`);
          }
          const embed = new Discord.RichEmbed()
            .setDescription(`${msg.author.username} poked <@${member.user.id}>`)
            .setImage(data.img)
          msg.channel.send({embed});
        })
      }
    },

    "slap": {
      usage: "<user>",
      description: "Slaps someone",
      process: function(msg, suffix) {
        var member = findMember(msg, suffix);
        if (member == null) return msg.channel.send("Couldn't find that user");
        if (msg.channel.type !== "text") return msg.channel.send("Why would you want to slap someone in DMs?");
        if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to slap`);
        if (member.user.id == msg.author.id) return msg.channel.send("Come on... Don't make yourself look like an idiot...");
        if (member.user.id == djs.user.id) return msg.channel.send(`**Slaps ${msg.author.username} back** That hurt me\n; ^ ;`);
        require("request")("http://api.shodanbot.com/interactions/slap", function(err, res, body) {
          if (err) return msg.channel.send("Error... Api returned nothing");
          try {
            var data = JSON.parse(body);
          } catch (error) {
            return msg.channel.send(`There was an error:\n${error}`);
          }
          const embed = new Discord.RichEmbed()
            .setDescription(`${msg.author.username} slapped <@${member.user.id}>`)
            .setImage(data.img)
          msg.channel.send({embed});
        })
      }
    },

    "boop": {
      usage: "<user>",
      description: "Boops someone",
      process: function(msg, suffix) {
        var member = findMember(msg, suffix);
        if (member == null) return msg.channel.send("Couldn't find that user");
        if (msg.channel.type !== "text") return msg.channel.send("Why would you want to boop someone in DMs?");
        if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to boop`);
        if (member.user.id == msg.author.id) return msg.channel.send("Why even try?");
        if (member.user.id == djs.user.id) return msg.channel.send(`Dun boop me ; ^ ;`);
        require("request")("http://api.shodanbot.com/interactions/boop", function(err, res, body) {
          if (err) return msg.channel.send("Error... Api returned nothing");
          try {
            var data = JSON.parse(body);
          } catch (error) {
            return msg.channel.send(`There was an error:\n${error}`);
          }
          const embed = new Discord.RichEmbed()
            .setDescription(`${msg.author.username} booped <@${member.user.id}>`)
            .setImage(data.img)
          msg.channel.send({embed});
        })
      }
    },

    "pat": {
      usage: "<user>",
      description: "Pats someone",
      process: function(msg, suffix) {
        var member = findMember(msg, suffix);
        if (member == null) return msg.channel.send("Couldn't find that user");
        if (msg.channel.type !== "text") return msg.channel.send("Why would you want to pat someone in DMs?");
        if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to pat`);
        if (member.user.id == msg.author.id) return msg.channel.send("<:NotLikeCat:411364955493761044>");
        if (member.user.id == djs.user.id) return msg.channel.send(`≥ w ≤`);
        require("request")("http://api.shodanbot.com/interactions/pat", function(err, res, body) {
          if (err) return msg.channel.send("Error... Api returned nothing");
          try {
            var data = JSON.parse(body);
          } catch (error) {
            return msg.channel.send(`There was an error:\n${error}`);
          }
          const embed = new Discord.RichEmbed()
            .setDescription(`${msg.author.username} patted <@${member.user.id}>`)
            .setImage(data.img)
          msg.channel.send({embed});
        })
      }
    },

    "stab": {
      usage: "<user>",
      description: "Stabs someone",
      process: function(msg, suffix) {
        var member = findMember(msg, suffix);
        if (member == null) return msg.channel.send("Couldn't find that user");
        if (msg.channel.type !== "text") return msg.channel.send("Why would you want to stab someone in DMs?");
        if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to stab`);
        if (member.user.id == msg.author.id) return msg.channel.send("Oh...");
        if (member.user.id == djs.user.id) return msg.channel.send(`<:rip:401656884525793291>`);
        const embed = new Discord.RichEmbed()
          .setDescription(`${msg.author.username} stabbed <@${member.user.id}>`)
        msg.channel.send({embed});
      }
    },

    "nom": {
      usage: "<user>",
      description: "noms someone",
      process: function(msg, suffix) {
        var member = findMember(msg, suffix);
        if (member == null) return msg.channel.send("Couldn't find that user");
        if (msg.channel.type !== "text") return msg.channel.send("Why would you want to nom someone in DMs?");
        if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to nom`);
        if (member.user.id == msg.author.id) return msg.channel.send("You are so weird...");
        if (member.user.id == djs.user.id) return msg.channel.send(`owie`);
        require("request")("http://api.shodanbot.com/interactions/nom", function(err, res, body) {
          if (err) return msg.channel.send("Error... Api returned nothing");
          try {
            var data = JSON.parse(body);
          } catch (error) {
            return msg.channel.send(`There was an error:\n${error}`);
          }
          const embed = new Discord.RichEmbed()
            .setDescription(`${msg.author.username} nommed <@${member.user.id}>`)
            .setImage(data.img)
          msg.channel.send({embed});
        })
      }
    },

    "ship": {
      usage: "<mention 1> <mention 2>",
      description: "Ships two people",
      process: async function(msg, suffix) {
        if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
        var args = suffix.split(" ");
        if (!args[0]) return msg.channel.send(`You need to provide two users as arguments`);
        if (!args[1]) return msg.channel.send(`You need to provide two users as arguments`);
        if (msg.mentions.members.first()) return msg.channel.send(`You cannot mention users to ship them due to issues. This will be resolved soon:tm:`);
        var member1 = findMember(msg, args[0]);
        if (member1 == null) return msg.channel.send(`Couldn't find the first member provided`);
        var member2 = findMember(msg, args[1]);
        if (member2 == null) return msg.channel.send(`Couldn't find the second member provided`);
        if (member1.id == member2.id) return msg.channel.send(`You can't ship someone with themselves, silly`);
        msg.channel.startTyping();
        let canvas = new Canvas.createCanvas(300, 100);
        let ctx = canvas.getContext("2d");
        var pfpurl1 =(member1.user.avatar)?`https://cdn.discordapp.com/avatars/${member1.user.id}/${member1.user.avatar}.png?size=128`: member1.user.defaultAvatarURL
        var pfpurl2 =(member2.user.avatar)?`https://cdn.discordapp.com/avatars/${member2.user.id}/${member2.user.avatar}.png?size=128`: member2.user.defaultAvatarURL
        Promise.all([
          new Promise(resolve => require("request")(pfpurl1, {encoding: null}, (e,r,b) => resolve(b))),
          new Promise(resolve => require("request")(pfpurl2, {encoding: null}, (e,r,b) => resolve(b))),
          util.promisify(fs.readFile)("./images/emojis/heart.png", { encoding: null }),
          util.promisify(fs.readFile)("./images/300x100.png", { encoding: null })
        ]).then(async ([avatar1, avatar2, emoji, template]) => {
          let templateI = new Canvas.Image();
          templateI.src = template;
          ctx.drawImage(templateI, 0, 0, 300, 100);
          let avatarI = new Canvas.Image();
          avatarI.src = avatar1;
          ctx.drawImage(avatarI, 0, 0, 100, 100);
          let emojiI = new Canvas.Image();
          emojiI.src = emoji;
          ctx.drawImage(emojiI, 110, 10, 80, 80);
          let avatarII = new Canvas.Image();
          avatarII.src = avatar2;
          ctx.drawImage(avatarII, 200, 0, 100, 100);
          let buffer = canvas.toBuffer();
          let percentage = Math.floor(Math.random() * (100 -1) + 1);
          await msg.channel.send(`Aww. I'd rate ${member1.user.tag} and ${member2.user.tag} being together a ${percentage}%`,{files: [buffer]});
          msg.channel.stopTyping();
        })
      }
    }
  }
}
