//@ts-check

const Discord = require("discord.js")

class GameStore {
	constructor() {
		/**
		 * @type {Discord.Collection<string, import("../../commands/games").Game|import("../../commands/games").TriviaGame>}
		 */
		this.store = new Discord.Collection()
		this.gamesPlayed = 0
	}
	/**
	 * @param {import("../../commands/games").Game|import("../../commands/games").TriviaGame} game
	 */
	addGame(game) {
		this.store.set(game.id, game)
	}
}

module.exports = GameStore
