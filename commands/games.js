let games = {};
let letters = ["a", "b", "c", "d"];
let request = require("request");
let entities = require("entities");

function newGame() {
	return {
		running: true,
		answers: {},
		correctID: null,
		answer: null
	}
}

module.exports = function(passthrough) {
	let { Discord, client, utils, reloadEvent } = passthrough;

	async function doQuestion(msg, authorName) {
		let id = msg.channel.id;
		if (!authorName) authorName = msg.author.username;
		if (games[id]) return msg.channel.send(`${authorName}, there's a game already in progress for this channel`);
		let game = newGame();
		games[id] = game;
		request("https://opentdb.com/api.php?amount=1", function(err, res, body) {
			let data;
			try {
				data = JSON.parse(body);
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
			let answer = data.results[0].correct_answer;
			game.answer = answer;
			let choices = data.results[0].incorrect_answers;
			choices.push(answer);
			let shuffled = choices.shuffle();
			let iOfA = shuffled.indexOf(answer);
			game.correctID = String.fromCharCode(iOfA+97);
			if (!game.correctID) {
				msg.channel.send(`Fuckery happened\n\nIndex of the answer: ${iOfA}\nShuffled Answer Array: ${shuffled}`);
				return delete games[id];
			}
			let [a1, a2, a3, a4] = shuffled;
			let color = 3447003;
			let reward = 0;
			let difficulty = undefined;
			switch(data.results[0].difficulty) {
				case "easy":
					color = 4249664;
					reward = 100;
					difficulty = "easy";
				break;
				case "medium":
					color = 12632064;
					reward = 250;
					difficulty = "medium";
				break;
				case "hard":
					color = 14164000;
					reward = 500;
					difficulty = "hard";
				break;
			}
			let str = `A: *${a1}*\nB: *${a2}*`;
			if (a3 && a4) str += `\nC: *${a3}*\nD: *${a4}*`;
			let guessembed = new Discord.RichEmbed()
				.setDescription(entities.decodeHTML(`**${data.results[0].category}** (${difficulty})\n${data.results[0].question}\n${str}`))
				.setColor(color)
				.setFooter("You have 20 seconds and can only answer once")
			msg.channel.send(guessembed);
			let notallowed = [];
			let won = false;
			let collector = msg.channel.createMessageCollector((m => !m.author.bot), { time: 20000 });
			collector.next.then(async msg => {
				if (notallowed.includes(msg.author.id)) return;
				let req = false;
				if (msg.content.toLowerCase() == game.correctID) req = true;
				else if (!letters.includes(msg.content.toLowerCase())) return;
				else return notallowed.push(msg.author.id);
				if (!req) return;
				won = true;
				let row = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				if (!row) {
					await utils.sql.all(`INSERT INTO money (userID, coins) VALUES (?, ?)`, [msg.author.id, 5000]);
					row = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, msg.author.id);
				}
				await utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [row.coins + reward, msg.author.id]);
				msg.author.send(`You recieved ${reward} coins for guessing correctly on trivia`).catch(() => msg.channel.send(`**${msg.author.tag}**, please enable DMs so I can tell you your earnings`));
				let resultembed = new Discord.RichEmbed()
					.setDescription(entities.decodeHTML(`**${game.correctID.toUpperCase()}:** ${game.answer}\n\n${msg.author.tag} won the game`))
					.setColor(color)
					.setFooter(`Click the reaction for another round.`)
				let nmsg = await msg.channel.send(resultembed);
				nmsg.reactionMenu([{ emoji: client.emojis.get("362741439211503616"), ignore: "total", actionType: "js", actionData: (msg, emoji, user) => { doQuestion(msg, user.username); }}]);
				return delete games[id];
			}).catch(() => { return; });
			collector.once("end", () => {
				setTimeout(async () => {
					if (won) return;
					let resultembed = new Discord.RichEmbed()
						.setDescription(entities.decodeHTML(`**${game.correctID.toUpperCase()}:** ${game.answer}\n\nNo one guessed correctly`))
						.setColor(color)
						.setFooter(`Click the reaction for another round.`)
					let nmsg = await msg.channel.send(resultembed);
					nmsg.reactionMenu([{ emoji: client.emojis.get("362741439211503616"), ignore: "total", actionType: "js", actionData: (msg, emoji, user) => { doQuestion(msg, user.username); }}]);
					return delete games[id];
				}, 500);
			});
		});
	}

	return {
		"trivia": {
			usage: "<play / categories>",
			description: "A game of trivia using OpenTDB or Open Trivia Data Base",
			aliases: ["trivia", "t"],
			category: "games",
			process: async function(msg, suffix) {
				if (suffix.toLowerCase() == "play" || suffix.toLowerCase() == "p") {
					doQuestion(msg);
				} else if (suffix.toLowerCase() == "categories" || suffix.toLowerCase() == "c") {
					request("https://opentdb.com/api_category.php", async function(err, res, body) {
						if (err) return msg.channel.send(`Error... API returned nothing`);
						let data;
						try {
							data = JSON.parse(body);
						} catch (error) { return msg.channel.send(`An error occurred while attempting to query the trivia category list\n${error}`); }
						let str = `There are ${data.trivia_categories.length} categories:\n\n${data.trivia_categories.map(c => c.name).join("\n")}`;
						try {
							await msg.author.send(str);
							if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
							return;
						} catch (reason) {
							return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`);
						}
					});
				} else return msg.channel.send(`${msg.author.username}, that's not a valid action to do`);
			}
		}
	}
}
