const Discord = require('discord.js');
const mined = new Set();
let sql = require("sqlite");
sql.open("./databases/money.sqlite");

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
              return msg.channel.send({embed});
            }
            if (isNaN(bet)) {
              return msg.channel.send(`${msg.author.username}, that's not a valid bet`);
            } else if (bet < 1) {
              return msg.channel.send(`${msg.author.username}, you must place a bet that is higher than 0`);
            } else if (row.coins < bet) {
              return msg.channel.send(`${msg.author.username}, not enough Discoins to place that bet.`);
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

    "megaslot": {
      usage: "",
      description: "Runs a random mega slot machine.",
      process: function (msg, suffix) {
        var slotArray = [':gem:', ':bomb:', ':cherries:', ':heart:', ':diamonds:', ':clubs:', ':spades:', ':black_joker:'];
        var randSlot1 = slotArray[Math.floor(Math.random() * slotArray.length)];
        var randSlot2 = slotArray[Math.floor(Math.random() * slotArray.length)];
        var randSlot3 = slotArray[Math.floor(Math.random() * slotArray.length)];
        var randSlot4 = slotArray[Math.floor(Math.random() * slotArray.length)];
        var randSlot5 = slotArray[Math.floor(Math.random() * slotArray.length)];
        var randSlot6 = slotArray[Math.floor(Math.random() * slotArray.length)];
        var randSlot7 = slotArray[Math.floor(Math.random() * slotArray.length)];
        var randSlot8 = slotArray[Math.floor(Math.random() * slotArray.length)];
        var randSlot9 = slotArray[Math.floor(Math.random() * slotArray.length)];
        const embed = new Discord.RichEmbed()
          .setDescription(`|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾ |\n__|       Slots       |__\n \\                    /\n   |‾‾‾‾‾‾‾‾‾‾‾‾|\n    ${randSlot1}${randSlot2}${randSlot3}\n     ${randSlot4}${randSlot5}${randSlot6}\n     ${randSlot7}${randSlot8}${randSlot9}\n /                    \\ \n|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾|\n|                        |\n|                        |\n|                        |\n‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾`)
        msg.channel.send({embed});
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
            }
            else {
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
            var randMine = Math.floor(Math.random() * (20 - 1) + 1);
            const embed = new Discord.RichEmbed()
              .setDescription(`**${msg.author.username} went mining for Discoins and got ${randMine} Discoins** <a:Discoin:422523472128901140> :pick:`)
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
    }
  }
}