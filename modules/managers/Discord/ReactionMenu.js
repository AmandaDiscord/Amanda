//@ts-check

const Discord = require("discord.js")
const reactionMenus = require("./reactionmenus")

class ReactionMenu {
	/**
	 * @param {Discord.Message} message
	 * @param {ReactionMenuAction[]} actions
	 */
	constructor(message, actions) {
		this.message = message
		this.actions = actions
		// @ts-ignore
		reactionMenus.set(this.message.id, this)
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
	 * Remove the menu from storage, and optionally delete its reactions.
	 * @param {boolean} [remove]
	 */
	destroy(remove) {
		reactionMenus.delete(this.message.id)
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
	 * @private
	 */
	_removeAll() {
		this.message.reactions.removeAll().catch(() => this._removeEach())
	}
	/**
	 * For each action, remove the client's reaction.
	 * @private
	 */
	_removeEach() {
		this.actions.forEach(a => {
			if (!a.messageReaction) return
			a.messageReaction.users.remove().catch(() => {})
		})
	}
}

module.exports = ReactionMenu

/**
 * @callback ReactionMenuActionCallback
 * @param {Discord.Message} message
 * @param {Discord.Emoji|Discord.ReactionEmoji} emoji
 * @param {Discord.User} user
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
