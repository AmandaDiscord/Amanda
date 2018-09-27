const rp = require("request-promise");
const entities = require("entities");

module.exports = function(passthrough) {
	let { Discord, client, utils, reloadEvent } = passthrough;

	class GameStorage {
		constructor() {
			this.games = [];
		}
		add(game) {
			this.games.push(game);
		}
		getChannel(channel) {
			return this.games.find(g => g.channel == channel);
		}
		remove(game) {
			this.games = this.games.filter(g => g != game);
		}
	}

	let games = new GameStorage();

	class Game {
		constructor(channel, data) {
			let api = data.results[0];
			// Storage
			this.storage = games;
			this.channel = channel;
			this.storage.add(this);
			// Answers
			let correctAnswer = api.correct_answer;
			let wrongAnswers = api.incorrect_answers;
			this.answers = wrongAnswers
				.map(answer => ({correct: false, answer}))
				.concat([{correct: true, answer: correctAnswer}])
				.shuffle()
				.map((answer, index) => Object.assign(answer, {letter: Buffer.from([0xf0, 0x9f, 0x85, 0x90+index]).toString()}));
			this.correctAnswer = entities.decodeHTML(correctAnswer);
			// Answer fields
			let answerFields = [[], []];
			this.answers.forEach((answer, index) => answerFields[index < this.answers.length/2 ? 0 : 1].push(answer));
			// Difficulty
			this.difficulty = api.difficulty;
			this.color =
				  this.difficulty == "easy"
				? 0x1ddd1d
				: this.difficulty == "medium"
				? 0xC0C000
				: this.difficulty == "hard"
				? 0xdd1d1d
				: 0x3498DB
			// Send message
			let embed = new Discord.RichEmbed()
			.setTitle(`${entities.decodeHTML(api.category)} (${api.difficulty})`)
			.setDescription("​\n"+entities.decodeHTML(api.question))
			.setColor(this.color);
			answerFields.forEach(f => embed.addField("​", f.map(a => `${a.letter} ${entities.decodeHTML(a.answer)}\n`).join("")+"​", true)) //SC: zero-width space and em space
			embed.setFooter("To answer, type a letter in chat. You have 20 seconds.");
			this.channel.send(embed);
			// Setup timer
			this.timer = setTimeout(() => this.end(), 20000);
			// Prepare to receive answers
			this.receivedAnswers = new Map();
		}
		addAnswer(msg) {
			// Check answer is a single letter
			if (msg.content.length != 1) return;
			// Get answer index
			let index = msg.content.toUpperCase().charCodeAt(0)-65;
			// Check answer is within range
			if (!this.answers[index]) return;
			// Add to received answers
			this.receivedAnswers.set(msg.author.id, index);
			//msg.channel.send(`Added answer: ${msg.author.username}, ${index}`);
		}
		end() {
			// Clean up
			clearTimeout(this.timer);
			this.storage.remove(this);
			// Check answers
			let winners = [...this.receivedAnswers.entries()].filter(r => this.answers[r[1]].correct);
			//TODO: award coins
			let coins =
				this.difficulty == "easy"
				? 200
				: this.difficulty == "medium"
				? 400
				: this.difficulty == "hard"
				? 800
				: 500 // excuse me what the fuck
			// Send message
			let embed = new Discord.RichEmbed()
			.setTitle("Correct answer:")
			.setDescription(this.correctAnswer)
			.setColor(this.color)
			.setFooter("Click the reaction for another round.")
			if (winners.length) {
				embed.addField("Winners", winners.map(w => `${client.users.get(w[0]).username} (+${coins} <a:Discoin:422523472128901140>)`).join("\n"));
			} else {
				embed.addField("Winners", "No winners.");
			}
			this.channel.send(embed).then(msg => {
				msg.reactionMenu([{emoji: client.emojis.get("362741439211503616"), ignore: "total", actionType: "js", actionData: () => {
					startGame(this.channel);
				}}]);
			});
		}
	}

	reloadEvent.once(__filename, () => {
		client.removeListener("message", answerDetector);
	});
	client.on("message", answerDetector);
	async function answerDetector(msg) {
		let game = games.getChannel(msg.channel);
		if (game) game.addAnswer(msg); // all error checking to be done inside addAnswer
	}

	return {
		"trivia": {
			usage: "none",
			description: "Play a game of trivia with other members and win Discoins",
			aliases: ["trivia", "t"],
			category: "games",
			process: async function(msg) {
				startGame(msg.channel);
			}
		}
	}

	async function startGame(channel) {
		// Check games in progress
		if (games.getChannel(channel)) return channel.send(`There's a game already in progress for this channel.`);
		// Send typing
		channel.sendTyping();
		// Get new game data
		let body = await rp("https://opentdb.com/api.php?amount=1");
		// Error check new game data
		let data;
		try {
			data = JSON.parse(body);
		} catch (error) {
			let embed = new Discord.RichEmbed()
			.setDescription(`There was an error parsing the data returned by the api\n${error} `+"```\n"+body+"```")
			.setColor(0xdd1d1d)
			return channel.send({embed});
		}
		if (data.response_code != 0) return channel.send(`There was an error from the api`);
		// Set up new game
		new Game(channel, data);
	}

				/*
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
				});*/
}
