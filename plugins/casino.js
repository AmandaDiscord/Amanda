const Discord = require('discord.js');
const mined = new Set();
let sql = require("sqlite");
sql.open("./databases/money.sqlite");
const Config = require("../config.json")

function findMember(msg, suffix, self = false) {
  if (!suffix) {
    if (self) return msg.member
    else return null
  } else {
    let member = msg.mentions.members.first() || msg.guild.members.get(suffix) || msg.guild.members.find(m => m.displayName.toLowerCase().includes(suffix.toLowerCase()) || m.user.username.toLowerCase().includes(suffix.toLowerCase()));
    return member
  }
}

module.exports = function(passthrough) {
  const {Discord, djs, dio} = passthrough;
  return {
    "dice": {
      usage: "",
      description: "Rolls two six sided die and tells you what you rolled.",
      process: function (msg, suffix) {
        const embed = new Discord.RichEmbed()
          .setAuthor("Dice")
          .addField(":game_die: Roll:", `You rolled a ${Math.floor(Math.random() * (6 - 1) + 1)} and a ${Math.floor(Math.random() * (6 - 1) + 1)}!`)
      msg.channel.send({embed});
      }
    },

    "slot": {
      usage: "<bet>",
      description: "Runs a random slot machine.",
      process: function (msg, args) {
        if(msg.channel.type !== 'text') {
          return msg.channel.send("You can't use this command in DMs!");
        }
        sql.get(`SELECT * FROM money WHERE userID ="${msg.author.id}"`).then(row => {
          if (!row) {
            sql.run("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
            return msg.channel.send(`No previous userdata was found for ${msg.author.username}... An entry has been created`)
          } else {
            var argArr = args.split(' ');
            var bet = argArr[0];
            var slotArray = ['apple', 'cherries', 'watermelon', 'pear', 'heart'];
            var randSlot1 = slotArray[Math.floor(Math.random() * slotArray.length)];
            var randSlot2 = slotArray[Math.floor(Math.random() * slotArray.length)];
            var randSlot3 = slotArray[Math.floor(Math.random() * slotArray.length)];
            var result = "";
            if (!bet) {
              const embed = new Discord.RichEmbed()
              .setImage(`https://github.com/bitsnake/resources/blob/master/Bot/Slots/AmandaSlots-${randSlot1}-${randSlot2}-${randSlot3}.png?raw=true`)
              .setColor("36393E")
              return msg.channel.send({embed});
            }
            if (isNaN(bet)) {
              return msg.channel.send(`${msg.author.username}, that's not a valid bet`);
            } else if (bet < 1) {
              return msg.channel.send(`${msg.author.username}, you must place a bet that is higher than 0`);
            } else if (row.coins < bet) {
              return msg.channel.send(`${msg.author.username}, not enough Discoins to place that bet.`);
            } else if (bet == "all" && row.coins != 0) {
              bet = row.coins;
            } else {
            if (randSlot1 == randSlot2 && randSlot2 == randSlot3) {
              var result = `Woah! Three of a kind! Lucky! You got ${bet * 4} Discoins! <a:Discoin:422523472128901140>`;
              sql.run(`UPDATE money SET coins = ${row.coins + (bet * 3)} WHERE userID = ${msg.author.id}`);
          } else if (randSlot1 == randSlot2) {
            var result = `Two of a kind. Nice. You got ${bet * 2} Discoins back <a:Discoin:422523472128901140>`;
            sql.run(`UPDATE money SET coins = ${row.coins + (bet - 0)} WHERE userID = ${msg.author.id}`);
          } else if (randSlot1 == randSlot3) {
            var result = `Two of a kind. Nice. You got ${bet * 2} Discoins back <a:Discoin:422523472128901140>`;
            sql.run(`UPDATE money SET coins = ${row.coins + (bet - 0)} WHERE userID = ${msg.author.id}`);
          } else if (randSlot2 == randSlot3) {
            var result = `Two of a kind. Nice. You got ${bet * 2} Discoins back <a:Discoin:422523472128901140>`;
            sql.run(`UPDATE money SET coins = ${row.coins + (bet - 0)} WHERE userID = ${msg.author.id}`);
          } else {
            var result = `Sorry. You didn't get a match. You lost ${bet} Discoins <a:Discoin:422523472128901140>`;
            sql.run(`UPDATE money SET coins = ${row.coins - bet} WHERE userID = ${msg.author.id}`);
          }
          const embed = new Discord.RichEmbed()
            .setDescription(result)
            .setImage(`https://github.com/bitsnake/resources/blob/master/Bot/Slots/AmandaSlots-${randSlot1}-${randSlot2}-${randSlot3}.png?raw=true`)
            .setColor("36393E")
          msg.channel.send({embed});
          }
        }
        }).catch(() => {
          console.error;
          sql.run("CREATE TABLE IF NOT EXISTS money (userID TEXT, coins INTEGER)").then(() => {
            sql.run("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
          });
        })
      }
    },

    "flip": {
      usage: "",
      description: "Flips a coin",
      process: function (msg, suffix) {
        var coinArray = ['heads <:coinH:402219464348925954>', 'tails <:coinT:402219471693021196>'];
        var randFlip = coinArray[Math.floor(Math.random() * coinArray.length)];
      msg.channel.send(`You flipped ${randFlip}`);
      }
    },

    "bf": {
      usage: "<bet> <side>",
      description: "Place a bet on a random flip",
      process: function (msg, args) {
        if(msg.channel.type !== 'text') {
          return msg.channel.send("You can't use this command in DMs!");
        }
        var argArr = args.split(' ');
        var bet = argArr[0];
        var side = argArr[1];
        sql.get(`SELECT * FROM money WHERE userID ="${msg.author.id}"`).then(row => {
          if (!row) {
            sql.run("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
            return msg.channel.send(`No previous userdata was found for ${msg.author.username}... An entry has been created`)
          } else {
            if (!bet) {
              return msg.channel.send(`${msg.author.username}, you must place a bet!`)
            }
            if (isNaN(bet)) {
              return msg.channel.send(`${msg.author.username}, that's not a valid bet`);
            } else if (bet < 1) {
              return msg.channel.send(`${msg.author.username}, you must place a bet that is higher than 0`)
            } else if (row.coins < bet) {
              return msg.channel.send(`${msg.author.username}, not enough Discoins to place that bet`)
            } else if (!side) {
              return msg.channel.send(`${msg.channel.username}, you must choose a side to bet on. Valid sides are h or t`);
            } else if (bet == "all" && row.coins != 0) {
              bet = row.coins;
            } else {
            var randFlip = Math.floor(Math.random() * (4 - 1) + 1)
            if (side == "h" && randFlip == 1) {
              msg.channel.send(`You guessed it! you got ${bet * 2} Discoins! <a:Discoin:422523472128901140>`);
              return sql.run(`UPDATE money SET coins = ${row.coins + (bet - 0)} WHERE userID = ${msg.author.id}`);
          }
          if (side == "t" && randFlip == 2) {
            msg.channel.send(`You guessed it! you got ${bet * 2} Discoins! <a:Discoin:422523472128901140>`);
            return sql.run(`UPDATE money SET coins = ${row.coins + (bet - 0)} WHERE userID = ${msg.author.id}`);
          }
          else {
            msg.channel.send(`Sorry. You didn't get it right. You lost ${bet} Discoins <a:Discoin:422523472128901140>`)
            return sql.run(`UPDATE money SET coins = ${row.coins - bet} WHERE userID = ${msg.author.id}`);
          }
          }
        }
        }).catch(() => {
          console.error();
          sql.run("CREATE TABLE IF NOT EXISTS money (userID TEXT, coins INTEGER)").then(() => {
            sql.run("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
            msg.channel.send("Database was either corrupted or didn't exist... Created the database");
          });
        })
      }
    },

    "coins": {
      usage: "<user>",
      description: "Returns the amount of coins you have",
      process: function (msg, suffix) {
        if(msg.channel.type !== 'text') {
          return msg.channel.send("You can't use this command in DMs!");
        }
        var member = findMember(msg, suffix, true);
        if (member == null) return msg.channel.send("Could not find that user");
        sql.get(`SELECT * FROM money WHERE userID ="${member.user.id}"`).then(row => {
          if (!row) {
            sql.run("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.user.id, 5000]);
            return msg.channel.send("User not found in the database. An entry has been created for them");
          } else {
            const embed = new Discord.RichEmbed()
            .setAuthor(`Coins for ${member.user.tag}`)
            .setDescription(`${row.coins} Discoins <a:Discoin:422523472128901140>`)
            .setColor("F8E71C")
            msg.channel.send({embed})
          }
        }).catch(() => {
          console.error;
          sql.run("CREATE TABLE IF NOT EXISTS money (userID TEXT, coins INTEGER)").then(() => {
            sql.run("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
            msg.channel.send("Database was either corrupted or didn't exist... Created the database");
          });
        })
      }
    },

    "mine": {
      usage: "",
      description: "Mines discoins",
      process: function (msg, suffix) {
        if(msg.channel.type !== 'text') {
          return msg.channel.send("You can't use this command in DMs!");
        }
        sql.get(`SELECT * FROM money WHERE userID ="${msg.author.id}"`).then(row => {
          if (!row) {
            sql.run("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
            msg.channel.send(`No previous userdata was found for ${msg.author.username}... Creating`)
          } else {
            if (mined.has(msg.author.id)) return msg.channel.send(`${msg.author.username}, you have already went mining within the past minute. Come back after it has been 1 minute.`);
            var randMine = Math.floor(Math.random() * (100 - 1) + 1);
            const embed = new Discord.RichEmbed()
              .setDescription(`**${msg.author.username} went mining and got ${randMine} Discoins** <a:Discoin:422523472128901140> :pick:`)
              .setColor("F8E71C")
              msg.channel.send({embed});
              sql.run(`UPDATE money SET coins = ${row.coins + (randMine + 0)} WHERE userID = ${msg.author.id}`);
              mined.add(msg.author.id);
              setTimeout(() => {
                mined.delete(msg.author.id);
              }, 60000);
          }
        }).catch(() => {
          console.error;
          sql.run("CREATE TABLE IF NOT EXISTS money (userID TEXT, coins INTEGER)").then(() => {
            sql.run("INSERT INTO money (userID, coins) VALUES (?, ?)", [msg.author.id, 5000]);
            msg.channel.send("Database was either corrupted or didn't exist... Created the database");
          });
        })
      }
    },

    "lb": {
      usage: "",
      description: "Gets the leaderboard for people with the most coins",
      process: function(msg, suffix) {
        sql.all("SELECT * FROM money WHERE userID != ? ORDER BY coins DESC LIMIT 10", djs.user.id).then(all => {
          const embed = new Discord.RichEmbed()
            .setAuthor("Leaderboards")
            .setDescription(all.map(row => `— ${dio.users[row.userID] ? dio.users[row.userID].username : row.userID} :: ${row.coins} <a:Discoin:422523472128901140>`).join("\n"))
            .setColor("F8E71C")
          msg.channel.send({embed});
        })
      }
    },

    "give": {
      usage: "<amount> <user>",
      description: "Gives discoins to a user from your account",
      process: async function(msg, suffix) {
        if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
        var args = suffix.split(" ");
        if (!args[0]) return msg.channel.send(`${msg.author.username}, you have to provide an amount to give and then a user`);
        if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid amount to gift`);
        if (args[0] < 1) return msg.channel.send(`${msg.author.username}, you cannot gift an amount less than 1`);
        var usertxt = msg.content.substring(Config.commandPrefix.length + args[0].length + 6)
        if (!usertxt) return msg.channel.send(`${msg.author.username}, you need to provide a user to give to`);
        var member = findMember(msg, usertxt);
        if (member == null) return msg.channel.send("Could not find that user");
        if (member.user.id == msg.author.id) return msg.channel.send(`You can't give coins to yourself, silly`);
        var author = await sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
        var target = await sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
        if (!target) return msg.channel.send(`${member.user.username} was not found in the database. They have to create an account first`);
        if (!author) return msg.channel.send(`You have not created an account yet. You can by make one by typing \`${Config.commandPrefix}coins\``);
        if (author.coins < args[0]) return msg.channel.send(`${msg.author.username}, you don't have enough coins to make that transaction`);
        var gift = parseInt(args[0]);
        sql.run(`UPDATE money SET coins =? WHERE userID=?`, [author.coins - gift, msg.author.id]);
       
        sql.run(`UPDATE money SET coins =? WHERE userID=?`, [target.coins + gift, member.user.id]);
        const embed = new Discord.RichEmbed()
          .setDescription(`**${msg.author.tag}** has given ${args[0]} Discoins to ${member.user.tag}`)
          .setColor("F8E71C")
        msg.channel.send({embed});
      }
    },

    "award": {
      usage: "<amount> <user>",
      description: "Awards a specific user ",
      process: async function(msg, suffix) {
        var nope = [["no", 300], ["Nice try", 1000], ["How about no?", 1550], [`Don't even try it ${msg.author.username}`, 3000]];
        var [no, time] = nope[Math.floor(Math.random() * nope.length)];
        if (["320067006521147393"].includes(msg.author.id)) {
          if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
          var args = suffix.split(" ");
          if (!args[0]) return msg.channel.send(`${msg.author.username}, you have to provide an amount to award and then a user`);
          if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid amount to award`);
          if (args[0] < 1) return msg.channel.send(`${msg.author.username}, you cannot award an amount less than 1`);
          var usertxt = msg.content.substring(Config.commandPrefix.length + args[0].length + 7)
          if (!usertxt) return msg.channel.send(`${msg.author.username}, you need to provide a user to award`);
          var member = findMember(msg, usertxt);
          if (member == null) return msg.channel.send("Could not find that user");
          if (member.user.id == msg.author.id) return msg.channel.send(`You can't award yourself, silly`);
          var target = await sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
          if (!target) return msg.channel.send(`${member.user.username} was not found in the database. They have to create an account first`);
          var award = parseInt(args[0]);
          sql.run(`UPDATE money SET coins =? WHERE userID=?`, [target.coins + award, member.user.id]);
          const embed = new Discord.RichEmbed()
            .setDescription(`**${msg.author.tag}** has awarded ${args[0]} Discoins to ${member.user.tag}`)
            .setColor("F8E71C")
          msg.channel.send({embed});
        } else {
           msg.channel.startTyping();
           setTimeout(() => {
             msg.channel.send(no).then(() => msg.channel.stopTyping());
          }, time)
        }
      }
    }
  }
}
