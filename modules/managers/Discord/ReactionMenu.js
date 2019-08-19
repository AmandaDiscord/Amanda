const Structures = require("../../structures");
const managers = require("../");

let reactionMenus = {};

class ReactionMenu {
	/**
	 * @param {Structures.Message} message
	 * @param {Array<managers.ReactionMenuAction>} actions
	 */
	constructor(message, actions) {
		this.message = message;
		this.actions = actions;
		reactionMenus[this.message.id] = this;
		this.promise = this.react();
		this.message.menu = this;
		this.menus = reactionMenus;
	}
	async react() {
		for (let a of this.actions) {
			a.messageReaction = await this.message.react(a.emoji).catch(new Function());
		}
	}
	/**
	 * @param {Boolean} [remove]
	 */
	destroy(remove) {
		delete reactionMenus[this.message.id];
		this.message.menu = null;
		if (remove) {
			if (this.message.channel.type == "text") {
				this.message.reactions.removeAll().catch(new Function());
			} else if (this.message.channel.type == "dm") {
				this.actions.forEach(a => {
					a.messageReaction.users.remove().catch(new Function())
				});
			}
		}
	}
}

module.exports = ReactionMenu;
