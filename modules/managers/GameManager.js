// @ts-check

const Discord = require("thunderstorm")

const passthrough = require("../../passthrough")

class GameManager {
	constructor() {
		/**
		 * @type {Discord.Collection<string, import("../../commands/games").Game|import("../../commands/games").TriviaGame>}
		 */
		this.cache = new Discord.Collection()
	}
	/**
	 * @param {import("../../commands/games").Game|import("../../commands/games").TriviaGame} game
	 */
	add(game) {
		passthrough.periodicHistory.add("game_start")
		this.cache.set(game.id, game)
	}
}

module.exports = GameManager
