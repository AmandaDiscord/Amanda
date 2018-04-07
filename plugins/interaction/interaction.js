exports.commands = [
  "hug",
  "kiss",
  "cuddle",
  "poke",
  "slap",
  "boop",
  "pat",
  "stab",
  "nom",
]


const Discord = require("discord.js");
const utils = require("bot-utils");
function findMember(msg, suffix, self = false) {
  if (!suffix) {
    if (self) return msg.member
    else return null
  } else {
    let member = msg.mentions.members.first() || msg.guild.members.get(suffix) || msg.guild.members.find(m => m.displayName.toLowerCase().includes(suffix.toLowerCase()) || m.user.username.toLowerCase().includes(suffix.toLowerCase()));
    return member
  }
}

exports.hug = {
  usage: "<user>",
  description: "Hugs someone",
  process: function(djs, dio, msg, suffix) {
    var member = findMember(msg, suffix);
    if (msg.channel.type !== "text") return msg.channel.send("Why would you want to hug someone in DMs?");
    if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to hug`);
    if (member.user.id == msg.author.id) return msg.channel.send("That's not strange at all...");
    if (member.user.id == djs.user.id) return msg.channel.send(`**Hugs ${msg.author.username} back** :heart:`);
      require("request")("http://api.shodanbot.com/interactions/hug",
      function(err, res, body) {
        if (err) return msg.channel.send("Error... Api returned nothing");
        try {
          var data = JSON.parse(body);
        } catch (error) {
          return msg.channel.send(`There was an error:\n${error}`);
        }
        if (member.user.id) {
           var atMem = `<@${member.user.id}>`
        } else {
           var atMem = suffix
        }
      const embed = new Discord.RichEmbed()
        .setDescription(`${msg.author.username} hugged ${atMem}`)
        .setImage(data.img)
      msg.channel.send({embed});
    })
  }
},

exports.kiss = {
  usage: "<user>",
  description: "Kisses someone",
  process: function(djs, dio, msg, suffix) {
    var member = findMember(msg, suffix);
    if (msg.channel.type !== "text") return msg.channel.send("Why would you want to kiss someone in DMs?");
    if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to kiss`);
    if (member.user.id == msg.author.id) return msg.channel.send(`W-What? Why, ${msg.author.username}?`);
    if (member.user.id == djs.user.id) return msg.channel.send(`**Kisses ${msg.author.username} back** :heart:`);
    require("request")("http://api.shodanbot.com/interactions/kiss",
    function(err, res, body) {
      if (err) return msg.channel.send("Error... Api returned nothing");
      try {
        var data = JSON.parse(body);
      } catch (error) {
        return msg.channel.send(`There was an error:\n${error}`);
      }
      if (member.user.id) {
           var atMem = `<@${member.user.id}>`
        } else {
           var atMem = suffix
        }
      const embed = new Discord.RichEmbed()
        .setDescription(`${msg.author.username} kissed ${atMem}`)
        .setImage(data.img)
      msg.channel.send({embed});
    })
  }
},

exports.cuddle = {
  usage: "<user>",
  description: "Cuddles someone",
  process: function(djs, dio, msg, suffix) {
    var member = findMember(msg, suffix);
    if (msg.channel.type !== "text") return msg.channel.send("Why would you want to cuddle someone in DMs?");
    if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to cuddle`);
    if (member.user.id == msg.author.id) return msg.channel.send("I find it strange that you tried to do that...");
    if (member.user.id == djs.user.id) return msg.channel.send(`**Cuddles ${msg.author.username} back** :heart:`);
    require("request")("http://api.shodanbot.com/interactions/cuddle",
    function(err, res, body) {
      if (err) return msg.channel.send("Error... Api returned nothing");
      try {
        var data = JSON.parse(body);
      } catch (error) {
        return msg.channel.send(`There was an error:\n${error}`);
      }
      if (member.user.id) {
           var atMem = `<@${member.user.id}>`
        } else {
           var atMem = suffix
        }
      const embed = new Discord.RichEmbed()
        .setDescription(`${msg.author.username} cuddled ${atMem}`)
        .setImage(data.img)
      msg.channel.send({embed});
    })
  }
},

exports.poke = {
  usage: "<user>",
  description: "Pokes someone",
  process: function(djs, dio, msg, suffix) {
    var member = findMember(msg, suffix);
    if (msg.channel.type !== "text") return msg.channel.send("Why would you want to poke someone in DMs?");
    if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to poke`);
    if (member.user.id == msg.author.id) return msg.channel.send("Ok then...");
    if (member.user.id == djs.user.id) return msg.channel.send(`Don't poke me ; ^ ;`);
    require("request")("http://api.shodanbot.com/interactions/poke",
    function(err, res, body) {
      if (err) return msg.channel.send("Error... Api returned nothing");
      try {
        var data = JSON.parse(body);
      } catch (error) {
        return msg.channel.send(`There was an error:\n${error}`);
      }
      if (member.user.id) {
           var atMem = `<@${member.user.id}>`
        } else {
           var atMem = suffix
        }
      const embed = new Discord.RichEmbed()
        .setDescription(`${msg.author.username} poked ${atMem}`)
        .setImage(data.img)
      msg.channel.send({embed});
    })
  }
},

exports.slap = {
  usage: "<user>",
  description: "Slaps someone",
  process: function(djs, dio, msg, suffix) {
    var member = findMember(msg, suffix);
    if (msg.channel.type !== "text") return msg.channel.send("Why would you want to slap someone in DMs?");
    if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to slap`);
    if (member.user.id == msg.author.id) return msg.channel.send("Come on... Don't make yourself look like an idiot...");
    if (member.user.id == djs.user.id) return msg.channel.send(`**Slaps ${msg.author.username} back** That hurt me\n; ^ ;`);
    require("request")("http://api.shodanbot.com/interactions/slap",
    function(err, res, body) {
      if (err) return msg.channel.send("Error... Api returned nothing");
      try {
        var data = JSON.parse(body);
      } catch (error) {
        return msg.channel.send(`There was an error:\n${error}`);
      }
      if (member.user.id) {
           var atMem = `<@${member.user.id}>`
        } else {
           var atMem = suffix
        }
      const embed = new Discord.RichEmbed()
        .setDescription(`${msg.author.username} hugged ${atMem}`)
        .setImage(data.img)
      msg.channel.send({embed});
    })
  }
},

exports.boop = {
  usage: "<user>",
  description: "Boops someone",
  process: function(djs, dio, msg, suffix) {
    var member = findMember(msg, suffix);
    if (msg.channel.type !== "text") return msg.channel.send("Why would you want to boop someone in DMs?");
    if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to boop`);
    if (member.user.id == msg.author.id) return msg.channel.send("Why even try?");
    if (member.user.id == djs.user.id) return msg.channel.send(`Dun boop me ; ^ ;`);
    require("request")("http://api.shodanbot.com/interactions/boop",
    function(err, res, body) {
      if (err) return msg.channel.send("Error... Api returned nothing");
      try {
        var data = JSON.parse(body);
      } catch (error) {
        return msg.channel.send(`There was an error:\n${error}`);
      }
      if (member.user.id) {
           var atMem = `<@${member.user.id}>`
        } else {
           var atMem = suffix
        }
      const embed = new Discord.RichEmbed()
        .setDescription(`${msg.author.username} booped ${atMem}`)
        .setImage(data.img)
      msg.channel.send({embed});
    })
  }
},

exports.pat = {
  usage: "<user>",
  description: "Pats someone",
  process: function(djs, dio, msg, suffix) {
    var member = findMember(msg, suffix);
    if (msg.channel.type !== "text") return msg.channel.send("Why would you want to pat someone in DMs?");
    if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to pat`);
    if (member.user.id == msg.author.id) return msg.channel.send("<:NotLikeCat:411364955493761044>");
    if (member.user.id == djs.user.id) return msg.channel.send(`≥ w ≤`);
    require("request")("http://api.shodanbot.com/interactions/pat",
    function(err, res, body) {
      if (err) return msg.channel.send("Error... Api returned nothing");
      try {
        var data = JSON.parse(body);
      } catch (error) {
        return msg.channel.send(`There was an error:\n${error}`);
      }
      if (member.user.id) {
           var atMem = `<@${member.user.id}>`
        } else {
           var atMem = suffix
        }
      const embed = new Discord.RichEmbed()
        .setDescription(`${msg.author.username} patted ${atMem}`)
        .setImage(data.img)
      msg.channel.send({embed});
    })
  }
},

exports.stab = {
  usage: "<user>",
  description: "Stabs someone",
  process: function(djs, dio, msg, suffix) {
    var member = findMember(msg, suffix);
    if (msg.channel.type !== "text") return msg.channel.send("Why would you want to stab someone in DMs?");
    if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to stab`);
    if (member.user.id == msg.author.id) return msg.channel.send("Oh...");
    if (member.user.id == djs.user.id) return msg.channel.send(`<:rip:401656884525793291>`);
    if (member.user.id) {
           var atMem = `<@${member.user.id}>`
        } else {
           var atMem = suffix
        }
    const embed = new Discord.RichEmbed()
      .setDescription(`${msg.author.username} stabbed ${atMem}`)
    msg.channel.send({embed});
  }
}

exports.nom = {
  usage: "<user>",
  description: "noms someone",
  process: function(djs, dio, msg, suffix) {
    var member = findMember(msg, suffix);
    if (msg.channel.type !== "text") return msg.channel.send("Why would you want to nom someone in DMs?");
    if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to nom`);
    if (member.user.id == msg.author.id) return msg.channel.send("You are so weird...");
    if (member.user.id == djs.user.id) return msg.channel.send(`owie`);
    require("request")("http://api.shodanbot.com/interactions/nom",
    function(err, res, body) {
      if (err) return msg.channel.send("Error... Api returned nothing");
      try {
        var data = JSON.parse(body);
      } catch (error) {
        return msg.channel.send(`There was an error:\n${error}`);
      }
      if (member.user.id) {
           var atMem = `<@${member.user.id}>`
        } else {
           var atMem = suffix
        }
      const embed = new Discord.RichEmbed()
        .setDescription(`${msg.author.username} nommed ${atMem}`)
        .setImage(data.img)
      msg.channel.send({embed});
    })
  }
}
