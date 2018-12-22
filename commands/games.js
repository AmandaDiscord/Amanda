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
		constructor(channel, data, category) {
			let api = data.results[0];
			// Storage
			this.storage = games;
			this.channel = channel;
			this.storage.add(this);
			// Category
			if (category) this.category = category;
			// Answers
			let correctAnswer = api.correct_answer.trim();
			let wrongAnswers = api.incorrect_answers.map(a => a.trim());
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
				embed.addField("Winners", winners.map(w => `${String(client.users.get(w[0]))} (+${w.winnings} ${utils.lang.emojiDiscoin})`).join("\n"));
			} else {
				embed.addField("Winners", "No winners.");
			}
			return this.channel.send(embed).then(msg => {
				msg.reactionMenu([
					{emoji: client.emojis.get("362741439211503616"), ignore: "total", actionType: "js", actionData: () => {
						startGame(this.channel, {category: this.category});
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
			process: async function(msg, suffix) {
				startGame(msg.channel, {suffix, msg});
			}
		}
	}

	async function JSONHelper(body, channel) {
		try {
			if (body.startsWith("http")) body = await rp(body);
			return [true, JSON.parse(body)];
		} catch (error) {
			let embed = new Discord.RichEmbed()
			.setDescription(`There was an error parsing the data returned by the api\n${error} `+"```\n"+body+"```")
			.setColor(0xdd1d1d)
			return [false, channel.send({embed})];
		}
	}

	async function startGame(channel, options = {}) {
		// Select category
		let category = options.category || null;
		if (options.suffix) {
			channel.sendTyping();
			let body = await JSONHelper("https://opentdb.com/api_category.php", channel);
			if (!body[0]) return;
			let data = body[1];
			if (options.suffix.includes("categor")) {
				options.msg.author.send(
					new Discord.RichEmbed()
					.setTitle("Categories")
					.setDescription(data.trivia_categories.map(c => c.name)
					.join("\n")+"\n\n"+
					"To select a category, use `&trivia <category name>`.")
				).then(() => {
					channel.send("I've sent you a DM with the list of categories.");
				}).catch(() => {
					channel.send(utils.lang.permissionAuthorDMBlocked(msg));
				});
				return;
			} else {
				let f = data.trivia_categories.filter(c => c.name.toLowerCase().includes(options.suffix));
				if (f.length == 0) {
					return channel.send("Found no categories with that name. Use `&trivia categories` for the complete list of categories.");
				} else if (f.length >= 2) {
					return channel.send("There are multiple categories with that name: **"+f[0].name+"**, **"+f[1].name+"**"+(f.length == 2 ? ". " : `, and ${f.length-2} more. `)+"Use `&trivia categories` for the list of available categories.");
				} else {
					category = f[0].id;
				}
			}
		}
		// Check games in progress
		if (games.getChannel(channel)) return channel.send(`There's a game already in progress for this channel.`);
		// Send typing
		channel.sendTyping();
		// Get new game data
		let body = await JSONHelper("https://opentdb.com/api.php?amount=1"+(category ? `&category=${category}` : ""), channel);
		if (!body[0]) return;
		let data = body[1];
		// Error check new game data
		if (data.response_code != 0) return channel.send(`There was an error from the api`);
		// Set up new game
		new Game(channel, data, category);
	}
}
