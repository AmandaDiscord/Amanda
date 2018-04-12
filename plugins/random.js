module.exports = function(passthrough) {
  const {Discord, djs, dio} = passthrough;
  return {
    "randnum": {
      usage: "<min #> <max #>",
      description: "Generates a random number from a given data range.",
      process: function(msg, args){
      var argArr = args.split(' ');
      var min = argArr[0];
      var max = argArr[1];
      if(!min) return msg.reply("Please provide a minimum number");
      if(!max) return msg.reply("Please provide a maximum number");
      const embed = new Discord.RichEmbed()
        .setAuthor("✨Random Number✨")
        .addField("Number:", `${Math.floor(Math.random() * (max - min) + min)}`)
      msg.channel.send({embed})
      }
    },

    "norris": {
        usage: "",
        description: "gives a random Chuck Norris joke",
        process: function(msg, suffix) {
            require("request")("http://api.icndb.com/jokes/random",
            function(err, res, body) {
                var data = JSON.parse(body);
                if (data && data.value && data.value.joke) {
                msg.channel.send(data.value.joke.replace(/&quot;/g,`"`))
                }
            });
        }
    },

    "yn": {
      usage: "",
      description: "Says yes or no about something.",
      process: function(msg, suffix) {
        var yesnoArray = ["yes", "no", "maybe"];
        var randChoice = yesnoArray[Math.floor(Math.random() * yesnoArray.length)];
        if (!suffix) {
          return msg.channel.send(`${msg.author.username}, you didn't ask a question`)
        }
        const embed = new Discord.RichEmbed()
          .setAuthor("Yes or No")
          .setDescription(`I'd have to say ${randChoice}`)
        msg.channel.send(":thinking: Let me think about that one...").then(nmsg => nmsg.edit({embed}))
      }
    },

    "ball": {
      usage: "",
      description: "Asks the 8ball a question.",
      process: function(msg, suffix) {
        var ballArray = ["The stars have fortold.", "The prophecy has told true.", "Absolutely", "Answer Unclear Ask Later", "Cannot Foretell Now", "Can't Say Now", "Chances Aren't Good", "Consult Me Later", "Don't Bet On It", "Focus And Ask Again", "Indications Say Yes", "Looks Like Yes", "No", "No Doubt About It", "Positively", "Prospect Good", "So It Shall Be", "The Stars Say No", "Unlikely", "Very Likely", "Yes", "You Can Count On It", "As I See It Yes", "Ask Again Later", "Better Not Tell You Now", "Cannot Predict Now", "Concentrate and Ask Again", "Don't Count On It", "It Is Certain", "It Is Decidedly So", "Most Likely", "My Reply Is No", "My Sources Say No", "Outlook Good", "Outlook Not So Good", "Reply Hazy Try Again", "Signs Point to Yes", "Very Doubtful", "Without A Doubt", "Yes", "Yes - Definitely", "You May Rely On It", "Ask Me If I Care", "Dumb Question Ask Another", "Forget About It", "Not A Chance", "Obviously", "Well Maybe", "What Do You Think?", "Whatever"];
        var randballChoice = ballArray[Math.floor(Math.random() * ballArray.length)];
        if (!suffix) {
          return msg.channel.send(`${msg.author.username}, you didn't ask the 8ball a question`);
        }
        const embed = new Discord.RichEmbed()
          .setDescription(":8ball:")
          .addField("You asked:", suffix)
          .addField("I'd have to say:", randballChoice)
        msg.channel.send(":thinking: Let me think about that one...").then(nmsg => nmsg.edit({embed}))
        }
    },

    "rate": {
      usage: "<Thing to rate>",
      description: "Rates something that you want rated",
      process: function(msg, suffix) {
        var randNum = Math.floor(Math.random() * (100 - 1) + 1)
        var esuffix = ''
        if (suffix.match(/(\W|^)you(\W|$)/i)) {
          var esuffix = suffix.replace(/(?:\W|^)(you)(?:\W|$)/ig, "me ")
        } else if (suffix.match(/(\W|^)me(\W|$)/i)) {
          var esuffix = suffix.replace(/(?:\W|^)(me)(?:\W|$)/ig, "you ")
        }
        else {
          var esuffix = suffix
        }
        msg.channel.send(`<:SuperThink:400184748649218058> I'd rate ${esuffix} a(n) ${randNum}/100`)
      }
    }
  }
}