var games = {};
const letters = ["a", "b", "c", "d"];
const Discord = require("discord.js");
const https = require("https");

function newGame() {
  return {
    running: true,
    answers: {},
    correctID: null,
    answer: null
  }
}

function shuffle(array) {
  var j, x, i;
  for (i = array.length -1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = array[i];
    array[i] = array[j];
    array[j] = x;
  }
  return array;
}

module.exports = function(passthrough) {
  const { Discord, djs, dio, reloadEvent } = passthrough;

  function doQuestion(msg) {
    var id = msg.channel.id;
    if (games[id]) return msg.channel.send(`${msg.author.username}, there's a game already in progress for this channel`);
    var game = newGame();
    games[id] = game;
    require("request")("https://opentdb.com/api.php?amount=1", function(err, res, body) {
      try {
        var data = JSON.parse(body);
      } catch (error) {
        const embed = new Discord.RichEmbed()
          .setDescription(`There was an error parsing the data returned by the api\n${error}`)
          .setColor(14164000)
        msg.channel.send({embed});
        return delete games[id];
      }
      if (data.response_code != 0) {
        msg.channel.send(`There was an error from the api`);
        return delete games[id];
      }
      var answer = data.results[0].correct_answer;
      game.answer = answer;
      var choices = data.results[0].incorrect_answers;
      choices.push(answer);
      var shuffled = shuffle(choices);
      var iOfA = shuffled.indexOf(answer);
      game.correctID = String.fromCharCode(iOfA+97);
      if (!game.correctID) {
        msg.channel.send(`Fuckery happened\n\nIndex of the answer: ${iOfA}\nShuffled Answer Array: ${shuffled}`);
        return delete games[id];
      }
      var [a1, a2, a3, a4] = shuffled;
      var color = 3447003;
        switch(data.results[0].difficulty) {
          case "easy":
            color = 4249664;
            break;
          case "medium":
            color = 12632064;
            break;
          case "hard":
            color = 14164000;
            break;
        }
      var guessembed = new Discord.RichEmbed()
        .setDescription(`**${data.results[0].category}**\n${data.results[0].question}\nA: *${a1}*\nB: *${a2}*\nC: *${a3}*\nD: *${a4}*`.replace(/(?:&[a-z="/ ]+?;|&\w+?;)/g, ""))
        .setColor(color)
      msg.channel.send(guessembed).then(msg => {
        let clocks = ["🕖", "🕗", "🕘", "🕙", "🕛"];
        clocks.forEach((c,i) => {
          setTimeout(() => {
            msg.react(c);
            if (i == clocks.length-1) {
              if (game == undefined || game.running == false) return;
              var correctUsersStr = `**Correct Answers:**\n`;
              let correct = Object.keys(game.answers).filter(k => game.correctID == game.answers[k]);
              if (correct.length == 0) {
                correctUsersStr = "Nobody got the answer right!";
              } else {
                if (correct.length > 6) {
                  correct.forEach(function(item, index, array) {
                    correctUsersStr += `${dio.users[item] ? dio.users[item].username : item}, `;
                  })
                } else {
                  correct.forEach(function(item, index, array) {
                    correctUsersStr += `${dio.users[item] ? dio.users[item].username : item}\n`;
                  })
                }
              }
              var resultembed = new Discord.RichEmbed()
                .setDescription(`**${game.correctID.toUpperCase()}:** ${game.answer}\n\n${correctUsersStr}`.replace(/(?:&[a-z="/ ]+?;|&\w+?;)/g, ""))
                .setColor(color)
                .setFooter(`"&trivia play" for another round.`)
              msg.channel.send(resultembed);
              return delete games[id];
            }
          }, i*4000);
        });
      });
    });
  }

  djs.on("message", messageHandler);
  function messageHandler(msg) {
    if (msg.author.bot) return;
    var id = msg.channel.id;
    var game = games[id];
    if (!game) return;
    if (letters.includes(msg.content.toLowerCase())) {
      game.answers[msg.author.id] = msg.content.toLowerCase();
    }
  }
  reloadEvent.on(__filename, () => {
    djs.removeListener("message", messageHandler);
  });
  return {
    "trivia": {
      usage: "<play / categories>",
      description: "A game of trivia using OpenTDB or Open Trivia Data Base",
      process: function(msg, suffix) {
        if (suffix == "play") {
          doQuestion(msg);
        } else if (suffix == "categories") {
          https.get("https://opentdb.com/api_category.php", (res) => {
            res.on('data', function(data) {
              try {
              var json = JSON.parse(data.toString());
              } catch (error) {
                msg.channel.send(`An error occurred while attempting to query the trivia category list\n${error}`);
              }
              var categories = "**Categories:** ";
              var i = 0;
              for(i in json.trivia_categories) categories = categories + "\n" + json.trivia_categories[i].name;
              var str = "A list has been sent to you via DM.";
              if(msg.channel.type == 'dm') str = "";
              msg.author.send(categories).catch(function(err) {
                str = "Unable to send you the list because you cannot receive DMs.";
                if(err != "DiscordAPIError: Cannot send messages to this user") console.log(err);
              }).then(function() {
                i++;
                msg.channel.send("There are " + i + " categories. " + str);
              });
            });
          }).on('error', function(err) {
        msg.channel.send("Failed to query category list.");
          });
        } else {
          msg.channel.send(`${msg.author.username}, that's not a valid action to do`);
        }
      }
    }
  }
}