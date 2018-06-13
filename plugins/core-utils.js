const Discord = require("discord.js");
const util = require("util");
var exports = module.exports = {};

/**
 * Converts seconds or miliseconds to a time string
 * @param {Int} input Any number
 * @param {String} format What format the input is; sec, ms or date
 * @returns {String} A humanized string of time
 */
exports.humanize = function(input, format) {
	if (format.toLowerCase() == "ms") var msec = parseInt(Math.floor(input));
	else if (format.toLowerCase() == "sec") var msec = parseInt(Math.floor(input * 1000));
	else if (format.toLocaleLowerCase() == "date") return new Date(input).toUTCString();
	else throw new Error("Invalid format provided");
	if (isNaN(msec)) throw new Error("Input provided is NaN");
	var days = Math.floor(msec / 1000 / 60 / 60 / 24);
	msec -= days * 1000 * 60 * 60 * 24;
	var hours = Math.floor(msec / 1000 / 60 / 60);
	msec -= hours * 1000 * 60 * 60;
	var mins = Math.floor(msec / 1000 / 60);
	msec -= mins * 1000 * 60;
	var secs = Math.floor(msec / 1000);
	var timestr = "";
	if (days > 0) timestr += days + " days ";
	if (hours > 0) timestr += hours + " hours ";
	if (mins > 0) timestr += mins + " minutes ";
	if (secs > 0) timestr += secs + " seconds";
	return timestr;
}

/**
 * Finds a member in a guild
 * @param {*} msg MessageResolvable
 * @param {String} usertxt Text that contains user's display data to search them by
 * @param {Boolean} self If the function should return <MessageResolvable>.member if no usertxt is provided
 * @returns {*} A member object or null if it couldn't find a member
 */
exports.findMember = function(msg, usertxt, self = false) {
	usertxt = usertxt.toLowerCase();
	let userIDMatch = usertxt.match(/<@!?(\d+)>/);
	let usertxtWithoutAt = usertxt.replace(/^@/, "");
	let matchFunctions = [];
	if (userIDMatch) matchFunctions.push(user => user.id == userIDMatch[1]);
	matchFunctions = matchFunctions.concat([
		member => member.user.tag.toLowerCase() == usertxtWithoutAt,
		member => member.user.username.toLowerCase() == usertxtWithoutAt,
		member => member.displayName.toLowerCase() == usertxtWithoutAt,
		member => member.user.username.toLowerCase().includes(usertxtWithoutAt),
		member => member.displayName.toLowerCase().includes(usertxtWithoutAt)
	]);
	if (!usertxt) {
		if (self) return msg.member;
		else return null;
	} else {
		return msg.guild.members.get(usertxt) || matchFunctions.map(f => {
				return msg.guild.members.find(m => f(m));
		}).find(m => m) || null;
	}
}

/**
 * Finds a user in cache
 * @param {*} msg MessageResolvable
 * @param {*} client Discord client
 * @param {String} usertxt Text that contains user's display data to search them by
 * @param {Boolean} self If the function should return <MessageResolvable>.author if no usertxt is provided
 * @returns {*} A user object or null if it couldn't find a user
 */
exports.findUser = function(msg, client, usertxt, self = false) {
	usertxt = usertxt.toLowerCase();
	let userIDMatch = usertxt.match(/<@!?(\d+)>/);
	let usertxtWithoutAt = usertxt.replace(/^@/, "");
	let matchFunctions = [];
	if (userIDMatch) matchFunctions.push(user => user.id == userIDMatch[1]);
	matchFunctions = matchFunctions.concat([
		user => user.tag.toLowerCase() == usertxtWithoutAt,
		user => user.username.toLowerCase() == usertxtWithoutAt,
		user => user.username.toLowerCase().includes(usertxtWithoutAt)
	]);
	if (!usertxt) {
		if (self) return msg.author;
		else return null;
	} else {
		return client.users.get(usertxt) || matchFunctions.map(f => {
				return client.users.find(u => f(u));
		}).find(u => u) || null;
	}
}

/**
 * Sends a message to a channel ID or user
 * @param {*} client Discord client
 * @param {String} id The ID of the channel or user if the user param is true
 * @param {*} message MessageResolvable
 * @param {Boolean} user If a message should be sent to a user by the id param
 * @returns {*} MessageResolvable
 */
exports.send = function(client, id, message, user = false) {
	return new Promise(function(resolve) {
		if (user) resolve(client.users.get(id).send(message));
		else resolve(client.channels.get(id).send(message));
	});
}

/**
 * Shuffles an array psuedorandomly
 * @returns {Array} An array which has been psuedorandomly shuffled
 */
Array.prototype.shuffle = function() {
	let old = [...this];
	let output = [];
	while (old.length) {
			let random = old.splice(Math.floor(Math.random()*old.length), 1)[0];
			output.push(random);
	}
	return output;
}

/**
 * Changes a presence string into an emoji
 * @param {String} presence The user's presence string
 * @returns {String} The emoji that matches that presence
 */
exports.getPresenceEmoji = function(presence) {
	const presences = {
		online: "<:online:453823508200554508>",
		idle: "<:idle:453823508028456971>",
		dnd: "<:dnd:453823507864748044>",
		offline: "<:invisible:453827513995755520>"
	};
	return presences[presence];
}

/**
 * Changes a presence type integer to a prefix string
 * @param {Number} type The user's presence integer
 * @returns {String} The prefix that matches the presence type
 */
exports.getPresencePrefix = function(type) {
	const prefixes = ["Playing", "Streaming", "Listening to", "Watching"];
	return prefixes[type];
}

/**
 * Converts a string to an emoji object
 * @param {String} emoji An emoji which is managed by Discord
 * @returns {String} The object of the provided emoji
 */
exports.emoji = function(emoji) {
	if (!emoji) return null;
	emoji = Discord.Util.parseEmoji(emoji);
	if(emoji == null) return null;
	if(emoji.id == null) return null;
	let type = "";
	if (emoji.animated) type = "gif";
	else type = "png";
	return { url: `https://cdn.discordapp.com/emojis/${emoji.id}.${type}`, id: emoji.id, name: emoji.name };
}

/**
 * Convert anything to a format suitable for sending as a Discord message.
 * @param {*} data Something to convert
 * @returns {String} The result of the conversion
 */
exports.stringify = async function(data) {
	let result;
	if (data === undefined) result = "(undefined)";
	else if (data === null) result = "(null)";
	else if (typeof(data) == "function") result = "(function)";
	else if (typeof(data) == "string") result = `"${data}"`;
	else if (typeof(data) == "number") result = data.toString();
	else if (data.constructor && data.constructor.name == "Promise")
		result = exports.stringify(await data);
	else if (data.constructor && data.constructor.name.toLowerCase().includes("error")) {
		let errorObject = {};
		Object.entries(data).forEach(e => {
			errorObject[e[0]] = e[1];
		});
		result = "```\n"+data.stack+"``` "+(await exports.stringify(errorObject));
	} else result = "```js\n"+util.inspect(data)+"```";

	if (result.length >= 2000) {
		if (result.startsWith("```")) {
			result = result.slice(0, 1995).replace(/`+$/, "").replace(/\n\s+/ms, "")+"…```";
		} else {
			result = result.slice(0, 1998)+"…";
		}
	}

	return result;
}

exports.progressBar = function(length, value, max) {
	let result = "";
	for (let i = 1; i <= length; i++) {
		if (value/max*length >= i) result += "=";
		else result += " ";
	}
	return result;
}