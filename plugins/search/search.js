exports.commands = [
  "urban",
]

const Discord = require("discord.js");

exports.urban = {
  usage: "<search term>",
  description: "Searches the urban dictionary for a term",
  process: function(djs, dio, msg, suffix) {
      require("request")(`http://api.urbandictionary.com/v0/define?term=${suffix}`,
        function(err, res, body){
        if (err) return msg.channel.send("Error... API returned nothing.");
          try {
          var data = JSON.parse(body);
          } catch (error) {
            return msg.channel.send(`Error while requesting the definition\n${error}`);
          }
          if (data.result_type == "no_results") return msg.channel.send(`${msg.author.username}, those are invalid search terms`)
          const embed = new Discord.RichEmbed()
            .setAuthor(data.list[0].word)
            .addField("Definition:", data.list[0].definition)
            .addField("Example:", data.list[0].example || "Not available")
            .setColor('RANDOM')
          msg.channel.send({embed})
      });
   }
}
