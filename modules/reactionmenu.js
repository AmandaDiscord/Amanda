//@ts-check

const Discord = require("discord.js")
const passthrough = require("../passthrough")

/**
 * @typedef {(message: Discord.Message, emoji: Discord.Emoji|Discord.ReactionEmoji, user: Discord.User, messageReaction: Discord.MessageReaction) => void} ReactionMenuActionCallback
 */

/**
 * @typedef {Object} ReactionMenuAction
 * @property {Discord.EmojiIdentifierResolvable} emoji
 * @property {Discord.MessageReaction} [messageReaction]
 * @property {string[]} [allowedUsers]
 * @property {string[]} [deniedUsers]
 * @property {string} [ignore]
 * @property {string} [remove]
 * @property {string} [actionType]
 * @property {ReactionMenuActionCallback} [actionData]
 */

void 0 // stop above jsdoc from applying to the class

module.exports = class ReactionMenu {
	/**
	 * @param {Discord.Message} message
	 * @param {ReactionMenuAction[]} actions
	 */
	constructor(message, actions) {
		this.message = message
		this.actions = actions
		passthrough.reactionMenus.set(this.message.id, this)
		this.react()
	}
	async react() {
		for (let a of this.actions) {
			let promise = this.message.react(a.emoji)
			promise.then(reaction => {
				a.messageReaction = reaction
			})
			promise.catch(() => {})
		}
	}
	/**
	 * @param {Boolean} [remove]
	 */
	destroy(remove) {
		passthrough.reactionMenus.delete(this.message.id)
		if (remove) {
			if (this.message.channel.type == "text") {
				this._removeAll()
			} else if (this.message.channel.type == "dm") {
				this._removeEach()
			}
		}
	}
	/**
	 * Call the endpoint to remove all reactions. Fall back to removing individually if this fails.
	 */
	_removeAll() {
		this.message.reactions.removeAll().catch(() => this._removeEach())
	}
	/**
	 * For each action, remove the client's reaction.
	 */
	_removeEach() {
		this.actions.forEach(a => {
			a.messageReaction.users.remove().catch(() => {})
		})
	}
}
