exports.commands = [
  "urban",
]

const Discord = require("discord.js");

exports.urban = {
  usage: "<search term>",
  description: "Searches the urban dictionary for a term",
  process: function(djs, dio, msg, suffix) {
    try {
      require("request")(`http://api.urbandictionary.com/v0/define?term=${suffix}`,
        function(err, res, body){
          var data = JSON.parse(body);
          if (data.result_type == "no_results") return msg.channel.send(`${msg.author.username}, those are invalid search terms`)
          const embed = new Discord.RichEmbed()
            .setAuthor(suffix)
            .addField("Definition:", data.list[0].definition)
            .addField("Example:", data.list[0].example)
            .setColor('RANDOM')
          msg.channel.send({embed})
      });
    } catch (error) {
      return msg.channel.send("There was an error querying that term...")
      }
   }
}
