const rp = require("request-promise");
const entities = require("entities");
const util = require("util");

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
			answerFields.forEach(f => embed.addField("​", f.map(a => `${a.letter} ${entities.decodeHTML(a.answer)} \n`).join("")+"​", true)) //SC: zero-width space and em space
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
		async end() {
			// Clean up
			clearTimeout(this.timer);
			this.storage.remove(this);
			// Check answers
			let coins =
				this.difficulty == "easy"
				? 150
				: this.difficulty == "medium"
				? 250
				: this.difficulty == "hard"
				? 500
				: 400 // excuse me what the fuck
			// Award coins
			const cooldownInfo = {
				max: 10,
				min: 2,
				step: 1,
				regen: {
					amount: 1,
					time: 30*60*1000
				}
			};
			let winners = [...this.receivedAnswers.entries()].filter(r => this.answers[r[1]].correct);
			await Promise.all(winners.map(async w => {
				let cooldownValue = await utils.cooldownManager(w[0], "trivia", cooldownInfo);
				w.winnings = Math.floor(coins * 0.8 ** (10-cooldownValue));
				w.text = `${coins} × 0.8^${(10-cooldownValue)} = ${w.winnings}`;
				utils.coinsManager.award(w[0], w.winnings);
			}));
			// Send message
			let embed = new Discord.RichEmbed()
			.setTitle("Correct answer:")
			.setDescription(this.correctAnswer)
			.setColor(this.color)
			.setFooter("Click the reaction for another round.")
			if (winners.length) {
				embed.addField("Winners", winners.map(w => `${String(client.users.get(w[0]))} (+${w.winnings} <a:Discoin:422523472128901140>)`).join("\n"));
			} else {
				embed.addField("Winners", "No winners.");
			}
			this.channel.send(embed).then(msg => {
				msg.reactionMenu([
					{emoji: client.emojis.get("362741439211503616"), ignore: "that", actionType: "js", actionData: () => {
						startGame(this.channel);
					}},
					{emoji: "🐞", ignore: "that", actionType: "js", actionData: async () => {
						msg.channel.send(
							(await utils.stringify(this))+" "+
							(await utils.stringify(this.answers, 10))+" "+
							(await utils.stringify(this.receivedAnswers, 10))
						);
					}}
				]);
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
}
