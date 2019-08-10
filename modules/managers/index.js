const Commands = require("./Discord/Commands");
const Games = require("./Discord/Games");
const Queues = require("./Discord/Queues");
const ReactionMenu = require("./Discord/ReactionMenu");

module.exports = {
	CommandStore: Commands,
	GameManager: Games,
	QueueManager: Queues,
	ReactionMenu: ReactionMenu
}