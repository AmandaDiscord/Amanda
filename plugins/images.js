module.exports = function(passthrough) {
  const {Discord, djs, dio} = passthrough;
  return {
    "cat": {
      usage: "",
      description: "Returns an image of a cute cat",
      process: function(msg, suffix){
      require("request")("https://cheweybot.ga/api/cat",
        function(err, res, body) {
            if (err) return msg.channel.send(`Error... API returned nothing`);
            try {
            var data = JSON.parse(body);
            } catch (error) {
                return msg.channel.send(`Uh oh. There was an error while requesting an image of a cat...\n${error}`)
            }
            const embed = new Discord.RichEmbed()
                .setImage(data.data)
                .setColor('RANDOM')
            msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => nmsg.edit({ embed }));
        });
      }
    },

    "dog": {
      usage: "",
      description: "Returns an image of a cute doggo",
      process: function(msg, suffix){
        require("request")("https://api.thedogapi.co.uk/v2/dog.php",
          function(err, res, body){
          if (err) return msg.channel.send("Error. The API returned nothing...");
            try {
            var data = JSON.parse(body);
            } catch (error) {
            return msg.channel.send(`Error while requesting an image of a dog.\n${error}`);
            }
            const embed = new Discord.RichEmbed()
              .setImage(`${data.data[0].url}`)
              .setColor('RANDOM')
            msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => nmsg.edit({embed})).catch(() => msg.channel.send("There was an error while fetching a doggo..."))
          });
      }
    },

    "space": {
      usage: "",
      description: "Returns an image of space",
      process: function(msg, suffix) {
        require("request")("https://cheweybot.ga/api/space",
          function(err, res, body) {
          if (err) return msg.channel.send("Error... API returned nothing");
            try {
            var data = JSON.parse(body);
            } catch (error) {
                return msg.channel.send(`Error while requesting a space image\n${error}`);
            }
            const embed = new Discord.RichEmbed()
              .setImage(data.data)
              .setColor('RANDOM')
            msg.channel.send("<a:SpaceLoading:429061691633041419>").then(nmsg => nmsg.edit({embed}))
          })
      }
    }
  }
}