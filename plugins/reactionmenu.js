const events = require("events");

let reactionMenus = {};

module.exports = function(passthrough) {
	let { djs, reloadEvent, utils } = passthrough;

	utils.reactionMenu = async function(msg, actions) {
		reactionMenus[msg.id] = {
			actions: actions
		}
		for (let a of actions) {
			await msg.react(a.emoji);
		}
	}

	djs.on("messageReactionAdd", reactionEvent);
	reloadEvent.once(__filename, () => {
		djs.removeListener("messageReactionAdd", reactionEvent);
	});

	function reactionEvent(messageReaction, user) {
		let msg = messageReaction.message;
		let emoji = messageReaction.emoji;
		if (user.id == djs.user.id) return;
		let menu = reactionMenus[msg.id];
		if (!menu) return;
		let action = menu.actions.find(a => a.emoji == emoji || (a.emoji.name == emoji.name && a.emoji.id == emoji.id));
		if (!action) return;
		if ((action.allowedUsers && !action.allowedUsers.includes(user.id)) || (action.deniedUsers && action.deniedUsers.includes(user.id))) {
			if (action.remove == "user") messageReaction.remove();
			return;
		}
		switch (action.actionType) {
		case "reply":
			msg.channel.send(user.mention+" "+action.actionData);
			break;
		case "edit":
			msg.edit(action.actionData);
			break;
		case "js":
			action.actionData(msg, emoji, user, messageReaction, reactionMenus);
			break;
		}
		switch (action.ignore) {
		case "that":
			menu.actions.find(a => a.emoji == emoji).actionType = "none";
			break;
		case "thatTotal":
			menu.actions = menu.actions.filter(a => a.emoji != emoji);
			break;
		case "all":
			menu.actions.forEach(a => a.actionType = "none");
			break;
		case "total":
			delete reactionMenus[msg.id];
			break;
		}
		switch (action.remove) {
		case "user":
			messageReaction.remove(user);
			break;
		case "bot":
			messageReaction.remove();
			break;
		case "all":
			msg.clearReactions();
			break;
		case "message":
			delete reactionMenus[msg.id];
			msg.delete();
			break;
		}
	}

}