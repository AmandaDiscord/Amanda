// @ts-check

const Discord = require("discord.js")

const passthrough = require("../../../passthrough")

class GameStore {
	constructor() {
		/**
		 * @type {Discord.Collection<string, import("../../../commands/games").Game|import("../../../commands/games").TriviaGame>}
		 */
		this.store = new Discord.Collection()
	}
	/**
	 * @param {import("../../../commands/games").Game|import("../../../commands/games").TriviaGame} game
	 */
	addGame(game) {
		passthrough.periodicHistory.add("game_start")
		this.store.set(game.id, game)
	}
}

module.exports = GameStore
