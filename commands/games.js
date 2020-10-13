// @ts-check

const fetchdefault = require("node-fetch").default
/** @type {fetchdefault} */
// @ts-ignore
const fetch = require("node-fetch")
const entities = require("entities")
const Discord = require("thunderstorm")
const path = require("path")
const Lang = require("@amanda/lang")
const ReactionMenu = require("@amanda/reactionmenu")

const emojis = require("../modules/emojis")

const passthrough = require("../passthrough")
const { constants, client, commands, reloader, games, streaks } = passthrough

const numbers = [":one:", ":two:", ":three:", ":four:", ":five:", ":six:", ":seven:", ":eight:", ":nine:"]
const streakStep = 10
const maxStreak = 10
const maxMultiplier = 10
const multiplierStep = 10
const absoluteMax = 1000

streaks.setDestroyDuration("trivia", 1000 * 60 * 15)

/**
 * @typedef TriviaResponse
 * @property {string} category
 * @property {string} type
 * @property {string} difficulty
 * @property {string} question
 * @property {string} correct_answer
 * @property {Array<string>} incorrect_answers
 */
undefined

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

class Game {
	/**
	 * @param {Discord.Message["channel"]} channel
	 * @param {string} type
	 */
	constructor(channel, type) {
		this.channel = channel
		this.type = type
		this.manager = games
		this.id = channel.id
		this.receivedAnswers = undefined
	}
	init() {
		this.manager.add(this)
		this.start()
	}
	destroy() {
		this.manager.cache.delete(this.id)
	}
	start() {
		// intentionally empty
	}
}
module.exports.Game = Game

class TriviaGame extends Game {
	/**
	 * @param {Discord.Message["channel"]} channel
	 * @param {{response_code: number, results: Array<TriviaResponse>}} data
	 * @param {number} category
	 * @param {Lang.Lang} lang
	 */
	constructor(channel, data, category, lang) {
		super(channel, "trivia")
		this.data = data.results[0]
		this.category = category
		this.earningsDisabled = false
		this.lang = lang
		/** @type {"trivia"} */
		this.type
		/**
		 * Map a userID to an answer index (A = 0, B = 1, C = 2, D = 3)
		 * @type {Map<string, number>}
		 */
		this.receivedAnswers = new Map()
	}
	async start() {
		const correctAnswer = this.data.correct_answer.trim()
		const wrongAnswers = this.data.incorrect_answers.map(a => a.trim())
		/** @type {Array<{ correct: boolean, answer: string }>} */
		this.answers = wrongAnswers
			.map(answer => ({ correct: false, answer }))
			.concat([{ correct: true, answer: correctAnswer }])
		utils.arrayShuffle(this.answers)
		this.answers = this.answers.map((answer, index) => Object.assign(answer, { letter: Buffer.from([0xf0, 0x9f, 0x85, 0x90 + index]).toString() }))
		this.correctAnswer = entities.decodeHTML(correctAnswer)
		// Answer Fields
		const answerFields = [[], []]
		this.answers.forEach((answer, index) => answerFields[index < this.answers.length / 2 ? 0 : 1].push(answer))
		// Difficulty
		this.difficulty = this.data.difficulty
		this.color =
			this.difficulty == "easy" ? 0x1ddd1d :
			this.difficulty == "medium" ? 0xC0C000 :
			this.difficulty == "hard" ? 0xdd1d1d :
			0x3498DB
		// Send Message
		const embed = new Discord.MessageEmbed()
			.setTitle(`${entities.decodeHTML(this.data.category)} (${this.data.difficulty})`)
			.setDescription(`​\n${entities.decodeHTML(this.data.question)}`) // SC: zero-width space
			.setColor(this.color)
		answerFields.forEach(f => embed.addFields({ name: "​", value: `${f.map(a => `${a.letter} ${entities.decodeHTML(a.answer)}\n`).join("")}​`, inline: true }))
		embed.setFooter(this.lang.games.trivia.prompts.provideAnswer)
		this.channel.send(await utils.contentify(this.channel, embed))
		// Setup timer
		this.timer = setTimeout(() => this.end(), 20000)
	}
	/**
	 * @param {Discord.Message} msg
	 */
	addAnswer(msg) {
		// Check answer is a single letter
		if (msg.content.length != 1) return
		// Get answer index
		const index = msg.content.toUpperCase().charCodeAt(0) - 65
		// Check answer is within range
		if (!this.answers[index]) return
		// Validate user legitimacy
		if (msg.author.bot && msg.guild.id == "497159726455455754") this.earningsDisabled = true
		if (msg.author.bot) return
		// Add to received answers
		this.receivedAnswers.set(msg.author.id, index)
		// msg.channel.send(`Added answer: ${msg.author.username}, ${index}`)
	}
	async end() {
		// Clean up
		clearTimeout(this.timer)
		this.destroy()
		// Check answers
		const coins =
			this.difficulty == "easy" ? 150 :
			this.difficulty == "medium" ? 250 :
			this.difficulty == "hard" ? 500 :
			0 // excuse me what the fuck
		// Award coins
		const cooldownInfo = {
			max: 10,
			min: 2,
			step: 1,
			regen: {
				amount: 1,
				time: 30 * 60 * 1000
			}
		}
		const winners = [...this.receivedAnswers.entries()].filter(r => this.answers[r[1]].correct)
		const losers = [...this.receivedAnswers.entries()].filter(r => !this.answers[r[1]].correct)
		const results = await Promise.all(winners.map(async w => {
			const result = {}
			result.userID = w[0]
			const cooldownValue = await utils.coinsManager.updateCooldown(w[0], "trivia", cooldownInfo)
			const streakGains = streaks.calculate({ max: maxStreak, step: streakStep, command: "trivia", userID: result.userID, maxMultiplier: maxMultiplier, multiplierStep: multiplierStep, absoluteMax: absoluteMax }, true)
			result.winnings = Math.floor(coins * 0.8 ** (10 - cooldownValue))
			// result.text = `${coins} × 0.8^${(10-cooldownValue)} = ${result.winnings}`
			if (!this.earningsDisabled) utils.coinsManager.award(result.userID, result.winnings + streakGains)
			return result
		}))
		for (const loser of losers) {
			streaks.delete(loser[0], "trivia")
		}
		// Send message
		const embed = new Discord.MessageEmbed()
			.setTitle("Correct answer:")
			.setDescription(this.correctAnswer)
			.setColor(this.color)
		if (results.length) embed.addFields({ name: this.lang.games.trivia.prompts.winners, value: results.map(r => `<@${r.userID}> (+${r.winnings} ${emojis.discoin}) ${streaks.getStreak(r.userID, "trivia") ? `(Streak: ${streaks.getStreak(r.userID, "trivia")} +${streaks.calculate({ max: maxStreak, step: streakStep, command: "trivia", userID: r.userID, maxMultiplier: maxMultiplier, multiplierStep: multiplierStep, absoluteMax: absoluteMax })} ${emojis.discoin})` : ""}`).join("\n") })
		else embed.addFields({ name: this.lang.games.trivia.prompts.winners, value: this.lang.games.trivia.prompts.noWinners })
		if (await utils.cacheManager.channels.typeOf({ id: this.channel.id }) === "dm" || await utils.cacheManager.channels.hasPermissions({ id: this.channel.id, guild_id: this.channel.guild.id }, 0x00000040)) embed.setFooter(this.lang.games.trivia.prompts.reactionRound)
		else embed.addFields({ name: this.lang.games.trivia.prompts.nextRound, value: `${this.lang.games.trivia.prompts.permissionDenied}\n\n${this.lang.games.trivia.prompts.permissionRound}` })
		return this.channel.send(await utils.contentify(this.channel, embed)).then(msg => {
			new ReactionMenu(msg, client, [
				{ emoji: "bn_re:362741439211503616", ignore: "total", actionType: "js", actionData: (message, emoji, user) => {
					if (user.bot) message.channel.send(`${user} SHUT UP!!!!!!!!`)
					else startGame(this.channel, { category: this.category, lang: this.lang })
				} }
			])
		})
	}
}
module.exports.TriviaGame = TriviaGame

/**
 * @param {string} body
 * @param {Discord.Message["channel"]} channel
 * @param {Lang.Lang} lang
 * @returns {Promise<[boolean, any]>}
 */
async function JSONHelper(body, channel, lang) {
	try {
		if (body.startsWith("http")) body = await fetch(body).then(data => data.json())
		return [true, body]
	} catch (error) {
		const embed = new Discord.MessageEmbed()
			.setDescription(lang.games.trivia.prompts.parsingError)
			.setColor(0xdd1d1d)
		return [false, channel.send(await utils.contentify(channel, embed))]
	}
}
/**
 * @param {Discord.Message["channel"]} channel
 * @param {{ suffix?: string, msg?: Discord.Message, category?: number, lang: Lang.Lang }} options
 */
async function startGame(channel, options) {
	// Select category
	let category = options.category || null
	if (options.suffix) {
		await channel.sendTyping()
		const [
			success,
			/** @type {{ trivia_categories: {id: number, name: string}[] }} */
			data
		] = await JSONHelper("https://opentdb.com/api_category.php", channel, options.lang)
		if (!success) return
		if (options.suffix.includes("categor")) {
			options.msg.author.send(
				new Discord.MessageEmbed()
					.setTitle(options.lang.games.trivia.prompts.categories)
					.setDescription(`${data.trivia_categories.map(c => c.name).join("\n")}\n\n${options.lang.games.trivia.prompts.categorySelect}`)
			).then(() => {
				channel.send(utils.replace(options.lang.games.trivia.prompts.dm, { "username": options.msg.author.username }))
			}).catch(() => {
				channel.send(options.lang.games.trivia.prompts.dmError)
			})
			return
		} else {
			let f = data.trivia_categories.filter(c => c.name.toLowerCase().includes(options.suffix.toLowerCase()))
			if (options.suffix.toLowerCase().endsWith("music")) f = data.trivia_categories.filter(c => c.name == "Entertainment: Music")
			if (f.length == 0) return channel.send(utils.replace(options.lang.games.trivia.prompts.noCategory, { "username": options.msg.author.username }))
			else if (f.length >= 2) return channel.send(`${utils.replace(options.lang.games.trivia.prompts.multipleCategories, { "username": "Hey", "string": (`**${f[0].name}**, **${f[1].name}**${(f.length == 2 ? ". " : `, and ${f.length - 2} more. `)}Use \`&trivia categories\` for the list of available categories.`) })}`)
			else category = f[0].id
		}
	}
	// Check games in progress
	if (games.cache.find(g => g.type == "trivia" && g.id == channel.id)) return channel.send(utils.replace(options.lang.games.trivia.prompts.gameInProgress, { "username": options.msg ? options.msg.author.username : "" }))
	// Send typing
	await channel.sendTyping()
	// Get new game data
	/** @type {Array<{response_code: number, results: Array<TriviaResponse>}>} */
	const body = await JSONHelper(`https://opentdb.com/api.php?amount=1${category ? `&category=${category}` : ""}`, channel, options.lang)
	if (!body[0]) return
	const data = body[1]
	// Error check new game data
	if (data.response_code != 0) return channel.send(options.lang.games.trivia.prompts.APIError)
	// Set up new game
	new TriviaGame(channel, data, category, options.lang).init()
}
utils.addTemporaryListener(client, "message", path.basename(__filename), answerDetector)
function answerDetector(msg) {
	/** @type {TriviaGame} */
	// @ts-ignore
	const game = games.cache.find(g => g.id == msg.channel.id && g.type == "trivia")
	if (game) game.addAnswer(msg) // all error checking to be done inside addAnswer
}


/**
 * @param {string} [difficulty="easy"] "easy", "medium" or "hard"
 * @param {number} [size=8] 4-14 inclusive
 * @returns {{text: string, size: number, bombs: number, error?: boolean}}
 */
function sweeper(difficulty, size) {
	let width = 8,
		bombs = 6,
		total = undefined,
		str = "",
		error = false
	const rows = [],
		board = [],
		pieceWhite = "⬜",
		pieceBomb = "💣"

	if (difficulty) {
		if (difficulty == "easy") bombs = 6
		if (difficulty == "medium") bombs = 8
		if (difficulty == "hard") bombs = 10
	}

	if (size) {
		let num
		if (size < 4) {
			num = 8
			error = true
		} else if (size > 14) {
			num = 8
			error = true
		} else num = size
		width = num
	}
	total = width * width

	// Place board
	let placed = 0
	while (placed < total) {
		board[placed] = pieceWhite
		placed++
	}

	// Place bombs
	let bombsPlaced = 0
	const placement = () => {
		const index = Math.floor(Math.random() * (total - 1) + 1)
		if (board[index] == pieceBomb) placement()
		else board[index] = pieceBomb
	}
	while (bombsPlaced < bombs) {
		placement()
		bombsPlaced++
	}

	// Create rows
	let currow = 1
	board.forEach((item, index) => {
		const i = index + 1
		if (!rows[currow - 1]) rows[currow - 1] = []
		rows[currow - 1].push(item)
		if (i % width == 0) currow++
	})

	// Generate numbers
	rows.forEach((row, index) => {
		row.forEach((item, iindex) => {
			if (item == pieceBomb) {
				const uprow = rows[index - 1]
				const downrow = rows[index + 1]
				const num = (it) => { return typeof it == "number" }
				const bmb = (it) => { return it == pieceBomb }
				const undef = (it) => { return it == undefined }

				if (uprow) {
					if (!bmb(uprow[iindex - 1])) {
						if (num(uprow[iindex - 1])) uprow[iindex - 1]++
						else if (!undef(uprow[iindex - 1])) uprow[iindex - 1] = 1
					}

					if (!bmb(uprow[iindex])) {
						if (num(uprow[iindex])) uprow[iindex]++
						else if (!undef(uprow[iindex])) uprow[iindex] = 1
					}

					if (!bmb(uprow[iindex + 1])) {
						if (num(uprow[iindex + 1])) uprow[iindex + 1]++
						else if (!undef(uprow[iindex + 1])) uprow[iindex + 1] = 1
					}
				}

				if (!bmb(row[iindex - 1])) {
					if (num(row[iindex - 1])) row[iindex - 1]++
					else if (!undef(row[iindex - 1])) row[iindex - 1] = 1
				}

				if (!bmb(row[iindex + 1])) {
					if (num(row[iindex + 1])) row[iindex + 1]++
					else if (!undef(row[iindex + 1])) row[iindex + 1] = 1
				}

				if (downrow) {
					if (!bmb(downrow[iindex - 1])) {
						if (num(downrow[iindex - 1])) downrow[iindex - 1]++
						else if (!undef(downrow[iindex - 1])) downrow[iindex - 1] = 1
					}

					if (!bmb(downrow[iindex])) {
						if (num(downrow[iindex])) downrow[iindex]++
						else if (!undef(downrow[iindex])) downrow[iindex] = 1
					}

					if (!bmb(downrow[iindex + 1])) {
						if (num(downrow[iindex + 1])) downrow[iindex + 1]++
						else if (!undef(downrow[iindex + 1])) downrow[iindex + 1] = 1
					}
				}
			}
		})
	})

	// Create a string to send
	rows.forEach(row => {
		row.forEach(item => {
			let it
			if (typeof item == "number") it = numbers[item - 1]
			else it = item
			str += `||${it}||`
		})
		str += "\n"
	})
	return { text: str, size: width, bombs: bombs, error: error }
}

commands.assign([
	{
		usage: "[category]",
		description: "Play a game of trivia with other members and win Discoins",
		aliases: ["trivia", "t"],
		category: "games",
		example: "&t Science: Computers",
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		process(msg, suffix, lang) {
			startGame(msg.channel, { suffix, msg, lang })
		}
	},
	{
		usage: "[easy|medium|hard] [--raw] [--size:number]",
		description: "Starts a game of minesweeper using the Discord spoiler system",
		aliases: ["minesweeper", "ms"],
		category: "games",
		example: "&ms hard --raw --size:10",
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			let size = 8, difficulty = "easy"
			let title
			const sfx = suffix.toLowerCase()

			if (sfx.includes("--size:")) {
				const tsize = +sfx.split("--size:")[1].split(" ")[0]
				if (isNaN(tsize)) size = 8
				else size = Math.floor(Number(tsize))
			}

			if (sfx.includes("medium")) difficulty = "medium"
			else if (sfx.includes("hard")) difficulty = "hard"

			const string = sweeper(difficulty, size)

			title = utils.replace(lang.games.minesweeper.returns.info, { "difficulty": difficulty, "number1": string.bombs, "number2": string.size, "number3": string.size })
			if (string.error) title += `\n${lang.games.minesweeper.returns.error}`
			const embed = new Discord.MessageEmbed().setColor(constants.standard_embed_color).setTitle(title).setDescription(string.text)
			if (sfx.includes("-r") || sfx.includes("--raw")) {
				const rawcontent = `${title}\n${string.text}`.replace(/\|/g, "\\|")
				if (rawcontent.length > 1999) return msg.channel.send(lang.games.minesweeper.returns.rawTooLarge)
				return msg.channel.send(rawcontent)
			}
			msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	}
])
