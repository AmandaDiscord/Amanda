const rp = require("request-promise");
const entities = require("entities");
const Discord = require("discord.js");
const path = require("path");

require("../types.js");

const numbers = [":one:", ":two:", ":three:", ":four:", ":five:", ":six:", ":seven:", ":eight:", ":nine:"];

/**
 * @typedef TriviaResponse
 * @property {String} category
 * @property {String} type
 * @property {String} difficulty
 * @property {String} question
 * @property {String} correct_answer
 * @property {Array<String>} incorrect_answers
 */

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { client, commands, reloader, gameManager } = passthrough;

	let utils = require("../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);

	class Game {
		/**
		 * @param {Discord.TextChannel} channel
		 * @param {String} type
		 */
		constructor(channel, type) {
			this.channel = channel;
			this.type = type;
			this.manager = gameManager;
			this.id = channel.id;
			this.permissions = channel.permissionsFor(client.user);
		}
		init() {
			this.manager.addGame(this);
			this.start();
		}
		destroy() {
			this.manager.storage.delete(this.id);
		}
		start() {
			// intentionally empty
		}
	}
	class TriviaGame extends Game {
		/**
		 * @param {Discord.TextChannel} channel
		 * @param {Object} data
		 * @param {Number} data.response_code
		 * @param {Array<TriviaResponse>} data.results
		 * @param {String} category
		 */
		constructor(channel, data, category) {
			super(channel, "trivia");
			this.data = data.results[0];
			this.category = category;
		}
		start() {
			let correctAnswer = this.data.correct_answer.trim();
			let wrongAnswers = this.data.incorrect_answers.map(a => a.trim());
			this.answers = wrongAnswers
				.map(answer => ({ correct: false, answer }))
				.concat([{ correct: true, answer: correctAnswer }])
				.shuffle()
				.map((answer, index) => Object.assign(answer, { letter: Buffer.from([0xf0, 0x9f, 0x85, 0x90+index]).toString() }));
			this.correctAnswer = entities.decodeHTML(correctAnswer);
			// Answer Fields
			let answerFields =[[], []];
			this.answers.forEach((answer, index) => answerFields[index < this.answers.length/2 ? 0 : 1].push(answer));
			// Difficulty
			this.difficulty = this.data.difficulty;
			this.color =
				  this.difficulty == "easy"
				? 0x1ddd1d
				: this.difficulty == "medium"
				? 0xC0C000
				: this.difficulty == "hard"
				? 0xdd1d1d
				: 0x3498DB
			// Send Message
			let embed = new Discord.RichEmbed()
				.setTitle(`${entities.decodeHTML(this.data.category)} (${this.data.difficulty})`)
				.setDescription("​\n"+entities.decodeHTML(this.data.question))
				.setColor(this.color);
			answerFields.forEach(f => embed.addField("​", f.map(a => `${a.letter} ${entities.decodeHTML(a.answer)} \n`).join("")+"​", true)) //SC: zero-width space and em space
			embed.setFooter("To answer, type a letter in chat. You have 20 seconds.");
			this.channel.send(utils.contentify(this.channel, embed));
			// Setup timer
			this.timer = setTimeout(() => this.end(), 20000);
			// Prepare to receive answers
			this.receivedAnswers = new Map();
		}
		/**
		 * @param {Discord.Message} msg
		 */
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
			gameManager.gamesPlayed++;
			this.destroy();
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
			if (winners.length) {
				embed.addField("Winners", winners.map(w => `${String(client.users.get(w[0]))} (+${w.winnings} ${lang.emoji.discoin})`).join("\n"));
			} else {
				embed.addField("Winners", "No winners.");
			}
			if (this.permissions.has("ADD_REACTIONS")) embed.setFooter("Click the reaction for another round.");
			else embed.setFooter(`${lang.permissionDeniedGeneric("add reactions")}\nType \`&t\` for another round`);
			return this.channel.send(utils.contentify(this.channel, embed)).then(msg => {
				msg.reactionMenu([
					{emoji: client.emojis.get("362741439211503616"), ignore: "total", actionType: "js", actionData: () => {
						startGame(this.channel, {category: this.category});
					}}
				]);
			});
		}
	}
	/**
	 * @param {String} body
	 * @param {Discord.TextChannel} channel
	 */
	async function JSONHelper(body, channel) {
		try {
			if (body.startsWith("http")) body = await rp(body);
			return [true, JSON.parse(body)];
		} catch (error) {
			let embed = new Discord.RichEmbed()
			.setDescription(`There was an error parsing the data returned by the api\n${error} `+"```\n"+body+"```")
			.setColor(0xdd1d1d)
			return [false, channel.send(utils.contentify(channel, embed))];
		}
	}
	/**
	 * @param {Discord.TextChannel} channel
	 * @param {Object} options
	 * @param {String} options.suffix
	 * @param {Discord.Message} options.msg
	 */
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
					channel.send(lang.dm.failed(msg));
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
		if (gameManager.storage.find(g => g.type == "trivia" && g.id == channel.id)) return channel.send(`There's a game already in progress for this channel.`);
		// Send typing
		channel.sendTyping();
		// Get new game data
		let body = await JSONHelper("https://opentdb.com/api.php?amount=1"+(category ? `&category=${category}` : ""), channel);
		if (!body[0]) return;
		let data = body[1];
		// Error check new game data
		if (data.response_code != 0) return channel.send(`There was an error from the api`);
		// Set up new game
		new TriviaGame(channel, data, category).init();
	}
	utils.addTemporaryListener(client, "message", path.basename(__filename), answerDetector);
	async function answerDetector(msg) {
		let game = gameManager.storage.find(g => g.id == msg.channel.id && g.type == "trivia");
		if (game) game.addAnswer(msg); // all error checking to be done inside addAnswer
	}


	/**
	 * @param {String} difficulty "easy", "medium" or "hard"
	 * @param {Number} size 4-14 inclusive
	 * @returns {any}
	 */
	function sweeper(difficulty, size) {
		let width = 8,
				bombs = 6,
				total = undefined,
				rows = [],
				board = [],
				pieceWhite = "⬜",
				pieceBomb = "💣",
				str = "",
				error = false;

		if (difficulty) {
			if (difficulty == "easy") bombs = 6;
			if (difficulty == "medium") bombs = 8;
			if (difficulty == "hard") bombs = 10;
		}

		if (size) {
			let num;
			if (size < 4) num = 8, error = true;
			else if (size > 14) num = 8, error = true;
			else num = size;
			width = num;
		}
		total = width * width;

		// Place board
		let placed = 0;
		while (placed < total) {
			board[placed] = pieceWhite;
			placed++;
		}

		// Place bombs
		let bombsPlaced = 0;
		let placement = () => {
			let index = Math.floor(Math.random() * (total - 1) + 1);
			if (board[index] == pieceBomb) placement();
			else board[index] = pieceBomb;
		}
		while (bombsPlaced < bombs) {
			placement();
			bombsPlaced++;
		}

		// Create rows
		let currow = 1;
		board.forEach((item, index) => {
			i = index+1;
			if (!rows[currow-1]) rows[currow-1] = [];
			rows[currow-1].push(item);
			if (i%width == 0) currow++;
		});

		// Generate numbers
		rows.forEach((row, index) => {
			row.forEach((item, iindex) => {
				if (item == pieceBomb) {
					let uprow = rows[index-1];
					let downrow = rows[index+1];
					let num = (it) => { return typeof it == "number" };
					let bmb = (it) => { return it == pieceBomb };
					let undef = (it) => { return it == undefined };

					if (uprow) {
						if (!bmb(uprow[iindex-1])) {
							if (num(uprow[iindex-1])) uprow[iindex-1]++;
							else if (!undef(uprow[iindex-1])) uprow[iindex-1] = 1;
						}

						if (!bmb(uprow[iindex])) {
							if (num(uprow[iindex])) uprow[iindex]++;
							else if (!undef(uprow[iindex])) uprow[iindex] = 1;
						}

						if (!bmb(uprow[iindex+1])) {
							if (num(uprow[iindex+1])) uprow[iindex+1]++;
							else if (!undef(uprow[iindex+1])) uprow[iindex+1] = 1;
						}
					}

					if (!bmb(row[iindex-1])) {
						if (num(row[iindex-1])) row[iindex-1]++;
						else if (!undef(row[iindex-1])) row[iindex-1] = 1;
					}

					if (!bmb(row[iindex+1])) {
						if (num(row[iindex+1])) row[iindex+1]++;
						else if (!undef(row[iindex+1])) row[iindex+1] = 1;
					}

					if (downrow) {
						if (!bmb(downrow[iindex-1])) {
							if (num(downrow[iindex-1])) downrow[iindex-1]++;
							else if (!undef(downrow[iindex-1])) downrow[iindex-1] = 1;
						}

						if (!bmb(downrow[iindex])) {
							if (num(downrow[iindex])) downrow[iindex]++;
							else if (!undef(downrow[iindex])) downrow[iindex] = 1;
						}

						if (!bmb(downrow[iindex+1])) {
							if (num(downrow[iindex+1])) downrow[iindex+1]++;
							else if (!undef(downrow[iindex+1])) downrow[iindex+1] = 1;
						}
					}
				}
			});
		});

		// Create a string to send
		rows.forEach(row => {
			row.forEach(item => {
				if (typeof item == "number") it = numbers[item-1];
				else it = item;
				str += `||${it}||`;
			});
			str += "\n";
		});
		return { text: str, size: width, bombs: bombs, error: error };
	}

	commands.assign({
		"trivia": {
			usage: "none",
			description: "Play a game of trivia with other members and win Discoins",
			aliases: ["trivia", "t"],
			category: "games",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: async function(msg, suffix) {
				startGame(msg.channel, {suffix, msg});
			}
		},
		"minesweeper": {
			usage: "<easy|medium|hard> [--raw] [--size:x]",
			description: "Starts a game of minesweeper using the Discord spoiler system",
			aliases: ["minesweeper", "ms"],
			category: "games",
			/**
			 * @param {Discord.Message} msg
			 * @param {String} suffix
			 */
			process: function(msg, suffix) {
				let size = 8, difficulty = "easy";
				let string, title;
				let sfx = suffix.toLowerCase();

				if (sfx.includes("--size:")) {
					let tsize = sfx.split("--size:")[1].substring().split(" ")[0];
					if (isNaN(tsize)) size = 8;
					else size = Math.floor(Number(tsize));
				}

				if (sfx.includes("medium")) difficulty = "medium";
				else if (sfx.includes("hard")) difficulty = "hard";

				string = sweeper(difficulty, size);

				title = `${difficulty} -- ${string.bombs} bombs, ${string.size}x${string.size} board`;
				if (string.error) title += "\nThe minimum size is 4 and the max is 14. Bounds have been adjusted to normals"
				let embed = new Discord.RichEmbed().setColor("36393E").setTitle(title).setDescription(string.text);
				if (sfx.includes("-r") || sfx.includes("--raw")) {
					let rawcontent = `${title}\n${string.text}`.replace(/\|/g, "\\|");
					if (rawcontent.length > 1999) return msg.channel.send("The raw content exceeded the 200 character limit. Consider using a smaller board size");
					return msg.channel.send(rawcontent);
				}
				msg.channel.send(utils.contentify(msg.channel, embed));
			}
		}
	});
}
