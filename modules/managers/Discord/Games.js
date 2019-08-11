const Discord = require("discord.js");

let Game = require("../../compiledtypings/game.js");

class GameManager {
	constructor() {
		/**
		 * @type {Discord.Collection<String, Game>}
		 */
		this.storage = new Discord.Collection();
		this.gamesPlayed = 0;
	}
	/**
	 * @param {Game} game
	 */
	addGame(game) {
		this.storage.set(game.id, game);
	}
}

module.exports = new GameManager();