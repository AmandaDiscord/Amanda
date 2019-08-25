//@ts-check

const Discord = require("discord.js")

class GameManager {
	constructor() {
		/**
		 * @type {Discord.Collection<String, import("../../commands/games").Game>}
		 */
		this.storage = new Discord.Collection()
		this.gamesPlayed = 0
	}
	/**
	 * @param {import("../../commands/games").Game} game
	 */
	addGame(game) {
		this.storage.set(game.id, game)
	}
}

module.exports = GameManager
