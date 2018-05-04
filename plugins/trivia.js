var games = {};
const letters = ["A", "B", "C", "D"];
const https = require("https");
const entities = require("html-entities").AllHtmlEntities;
const Discord = require("discord.js");

function newGame() {
  return {
    running: true,
    players: [],
    correct: [],
    correctID: null,
    answer: null
  }
}

function doQuestion(msg) {
  var id = msg.channel.id;
  if (games[id]) return msg.channel.send(`${msg.author.username}, there's a game already in progress for this channel`);
  var game = newGame();
  games[id] = game;
  https.get("https://opentdb.com/api.php?amount=1", (res) => {
    res.on("data", function(response) {
      if (!game) return;
      try {
        var data = JSON.parse(response.toString());
      } catch (error) {
        const embed = new Discord.RichEmbed()
          .setDescription(`An error occurred while attempting to query a trivia game\n${error}`)
          .setColor(14164000)
        msg.channel.send({embed});
        return delete game;
      }
      if (data.response_code != 0) {
        console.log(`Error from OpenTDB\n ${data}`);
        msg.channel.send(`There was an error from the trivia api\n${data.response_code}`);
        return delete game;
      }
      var answer = data.results[0].correct_answer;
      answers = answer.concat(data.results[0].incorrect_answers);
      var answerStr = "";
      for (var i = 0; i <= answers.length-1; i++) {
        if(answers[i] == data.results[0].correct_answer) game.correctID = i;
        answerStr = `${answerStr}**${letters[i]}:** ${entities.decode(answers[i])}\n`;
      }
      var categoryString = entities.decode(data.results[0].category);
      var guessembed = new Discord.RichEmbed()
        .setDescription(`*${categoryString}*\n**${entities.decode(data.results[0].question)}**\n${answerStr}\nType a letter to answer!`)
        .setColor(4249664)
      msg.channel.send({guessembed});
      game.answer = data.results[0].correct_answer;
      setTimeout(function() {
        if (game == undefined || game.running == false) return;
        var correctUsersStr = `**Correct Answers:**\n`;
        if (game.correct.length == 0) {
          correctUsersStr = "Nobody!";
        } else {
          if (game.correct.length == 1) {
            correctUsersStr = "Correct!";
          } else if (game.correct.length > 10) {
            game.correct.forEach(function(item, index, array) {
              correctUsersStr += `${dio.users[item] ? dio.users[item].username : item}, `;
            })
          } else {
            game.correct.forEach(function(item, index, array) {
              correctUsersStr += `${dio.users[item] ? dio.users[item].username : item}\n`;
            })
          }
        }
        var resultembed = new Discord.RichEmbed()
          .setDescription(`**${letters[game.correctID]}:**${entities.decode(game.answer)}\n\n${correctUsersStr}`)
          .setColor(4249664)
        msg.channel.send({resultembed});
        return delete game;
      }, 15000);
    })
  }).on("error", function(err) {
    const embed = new Discord.RichEmbed()
      .setDescription(`An error occurred while attempting to query a trivia game\n${err}`)
      .setColor(14164000)
    msg.channel.send({embed});
    return delete game;
  })
}

module.exports = function(passthrough) {
  const { Discord, djs, dio } = passthrough;

  djs.on("message", msg => {
    var id = msg.channel.id;
    if (games[id] && letters[games[id].correctID]) {
      var game = games[id];
      if (game.correct.includes(msg.author.id)) return;
      game.players.push(msg.author.id);
      game.correct.push(msg.author.id);
    } else return;
  })
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