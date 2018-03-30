exports.commands = [
  "cat",
  "dog",
  "space",
]

const Discord = require("discord.js");

exports.cat = {
  usage: "",
  description: "Returns an image of a cute cat",
  process: function(djs, dio, msg, suffix){
   require("request")("http://aws.random.cat/meow",
    function(err, res, body) {
        if (err) return msg.channel.send(`Uh oh. There was an error while requesting an image of a cat...`);
        try {
        var data = JSON.parse(body);
        } catch (error) {
            return msg.channel.send(`Uh oh. There was an error while requesting an image of a cat...`)
        }
        const embed = new Discord.RichEmbed()
            .setImage(data.file)
            .setColor('RANDOM')
        msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => nmsg.edit({ embed }));
    });
 }
},

exports.dog = {
  usage: "",
  description: "Returns an image of a cute doggo",
  process: function(djs, dio, msg, suffix){
    require("request")("https://api.thedogapi.co.uk/v2/dog.php",
      function(err, res, body){
        var data = JSON.parse(body);
        const embed = new Discord.RichEmbed()
          .setImage(`${data.data[0].url}`)
          .setColor('RANDOM')
        msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => nmsg.edit({embed})).catch(() => msg.channel.send("There was an error while fetching a doggo..."))
      });
  }
},

exports.space = {
  usage: "",
  description: "Returns an image of space",
  process: function(djs, dio, msg, suffix) {
    require("request")("https://cheweybot.ga/api/space",
      function(err, res, body) {
        var data = JSON.parse(body);
        const embed = new Discord.RichEmbed()
          .setImage(data.data)
          .setColor('RANDOM')
        msg.channel.send("<a:SpaceLoading:429061691633041419>").then(nmsg => nmsg.edit({embed}))
      })
  }
}
