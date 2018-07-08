const util = require("util");

module.exports = function(passthrough) {
	let { Discord, client, reloadEvent, utils, db, commands } = passthrough;

	/**
	 * Sends a typing event to a channel that times out
	 */
	Discord.Channel.prototype.sendTyping = function() {
		if (this.startTyping) this.client.rest.methods.sendTyping(this.id);
	}

	/**
	 * Checks if a user or guild has certain permission levels
	 * @param {Object} DiscordObject An object of a user or guild
	 * @param {String} Permission The permission to test if the Snowflake has
	 * @returns {Boolean} If the Snowflake is allowed to use the provided string permission
	 */
	utils.hasPermission = async function() {
		let args = [...arguments];
		let thing, thingType, permissionType;
		if (typeof(args[0]) == "object") {
			thing = args[0].id;
			if (args[0].constructor.name == "Guild") thingType = "server";
			else thingType = "user";
			permissionType = args[1];
		} else {
			[thing, thingType, permissionType] = args;
		}
		let result;
		if (thingType == "user" || thingType == "member") {
			result = await utils.get(`SELECT ${permissionType} FROM UserPermissions WHERE userID = ?`, thing);
		} else if (thingType == "server" || thingType == "guild") {
			result = await utils.get(`SELECT ${permissionType} FROM ServerPermissions WHERE serverID = ?`, thing);
		}
		if (result) result = Object.values(result)[0];
		return !!result;
	}

	/**
	 * Sends a denying message to a text channel
	 * @param {*} msg MessageResolvable
	 */
	utils.sendNopeMessage = function(msg) {
		const nope = [["no", 300], ["Nice try", 1000], ["How about no?", 1550], [`Don't even try it ${msg.author.username}`, 3000]];
		let [no, time] = nope[Math.floor(Math.random() * nope.length)];
		msg.channel.sendTyping();
		setTimeout(() => {
			msg.channel.send(no);
		}, time);
	}

	/**
	 * Gets the connection to the MySQL database
	 * @returns {*} Database Connection
	 */
	utils.getConnection = function() {
		return db.getConnection();
	}

	/**
	 * Easy SQL statements that return promises for the MySQL database
	 * @param {*} string SQL statement
	 * @param {*} prepared An array of items supporting prepared statements
	 * @param {*} connection Database connection
	 * @param {*} attempts I actually don't know what this is
	 * @returns {Promise} An array of database rows
	 */
	utils.sql = function(string, prepared, connection, attempts) {
		if (!attempts) attempts = 2;
		if (!connection) connection = db;
		if (prepared !== undefined && typeof(prepared) != "object") prepared = [prepared];
		return new Promise((resolve, reject) => {
			connection.execute(string, prepared).then(result => {
				let rows = result[0];
				resolve(rows);
			}).catch(err => {
				console.error(err);
				attempts--;
				if (attempts) utils.sql(string, prepared, connection, attempts).then(resolve).catch(reject);
				else reject(err);
			});
		});
	}

	/**
	 * The same as utils.sql (?) :thonk:
	 * @param {*} string SQL statement
	 * @param {*} prepared An array of items supporting prepared statements
	 * @param {*} connection Database connection
	 * @returns {Promise} A database row
	 */
	utils.get = async function(string, prepared, connection) {
		return (await utils.sql(string, prepared, connection))[0];
	}

	/**
	 * Converts seconds or miliseconds to a time string
	 * @param {Int} input Any number
	 * @param {String} format What format the input is; sec, ms or date
	 * @returns {String} A humanized string of time
	 */
	utils.humanize = function(input, format) {
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
		if (days > 0) timestr += days + "d ";
		if (hours > 0) timestr += hours + "h ";
		if (mins > 0) timestr += mins + "m ";
		if (secs > 0) timestr += secs + "s";
		return timestr;
	}

	/**
	 * Finds a member in a guild
	 * @param {*} msg MessageResolvable
	 * @param {String} usertxt Text that contains user's display data to search them by
	 * @param {Boolean} self If the function should return <MessageResolvable>.member if no usertxt is provided
	 * @returns {(Member|null)} A member object or null if it couldn't find a member
	 */
	utils.findMember = function(msg, usertxt, self = false) {
		usertxt = usertxt.toLowerCase();
		if (/<@!?(\d+)>/.exec(usertxt)) usertxt = /<@!?(\d+)>/.exec(usertxt)[1];
		let matchFunctions = [];
		matchFunctions = matchFunctions.concat([
			member => member.id.includes(usertxt),
			member => member.user.tag.toLowerCase() == usertxt,
			member => member.user.username.toLowerCase() == usertxt,
			member => member.displayName.toLowerCase() == usertxt,
			member => member.user.username.toLowerCase().includes(usertxt),
			member => member.displayName.toLowerCase().includes(usertxt)
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
	 * @param {String} usertxt Text that contains user's display data to search them by
	 * @param {Boolean} self If the function should return <MessageResolvable>.author if no usertxt is provided
	 * @returns {(User|null)} A user object or null if it couldn't find a user
	 */
	utils.findUser = function(msg, usertxt, self = false) {
		usertxt = usertxt.toLowerCase();
		if (/<@!?(\d+)>/.exec(usertxt)) usertxt = /<@!?(\d+)>/.exec(usertxt)[1];
		let matchFunctions = [];
		matchFunctions = matchFunctions.concat([
			user => user.id.includes(usertxt),
			user => user.tag.toLowerCase() == usertxt,
			user => user.username.toLowerCase() == usertxt,
			user => user.username.toLowerCase().includes(usertxt)
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
	 * @param {String} id The ID of the channel or user if the user param is true
	 * @param {MessageResolvable} message MessageResolvable
	 * @param {Boolean} user If a message should be sent to a user by the id param
	 * @returns {MessageResolvable} MessageResolvable
	 */
	utils.send = function(id, message, user = false) {
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
	utils.getPresenceEmoji = function(presence) {
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
	utils.getPresencePrefix = function(type) {
		const prefixes = ["Playing", "Streaming", "Listening to", "Watching"];
		return prefixes[type];
	}

	/**
	 * Converts a string to an emoji object
	 * @param {String} emoji An emoji which is managed by Discord
	 * @returns {String} The object of the provided emoji
	 */
	utils.emoji = function(emoji) {
		if (!emoji) return null;
		emoji = Discord.Util.parseEmoji(emoji);
		if(emoji == null) return null;
		if(emoji.id == null) return null;
		let type = "";
		if (emoji.animated) type = "gif";
		else type = "png";
		return { url: `https://cdn.discordapp.com/emojis/${emoji.id}.${type}`, id: emoji.id, name: emoji.name, animated: emoji.animated };
	}

	/**
	 * Convert anything to a format suitable for sending as a Discord message.
	 * @param {*} data Something to convert
	 * @returns {String} The result of the conversion
	 */
	utils.stringify = async function(data) {
		let result;
		if (data === undefined) result = "(undefined)";
		else if (data === null) result = "(null)";
		else if (typeof(data) == "function") result = "(function)";
		else if (typeof(data) == "string") result = `"${data}"`;
		else if (typeof(data) == "number") result = data.toString();
		else if (data.constructor && data.constructor.name == "Promise") result = utils.stringify(await data);
		else if (data.constructor && data.constructor.name.toLowerCase().includes("error")) {
			let errorObject = {};
			Object.entries(data).forEach(e => {
				errorObject[e[0]] = e[1];
			});
			result = "```\n"+data.stack+"``` "+(await utils.stringify(errorObject));
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

	/**
	 * A progress bar for music
	 * @param {*} length Length of the bar
	 * @param {*} value The current time in the video
	 * @param {*} max The max amount of time in the video
	 */
	utils.progressBar = function(length, value, max, text) {
		if (!text) text = "";
		let textPosition = Math.floor(length/2) - Math.ceil(text.length/2) + 1;
		let result = "";
		for (let i = 1; i <= length; i++) {
			if (i >= textPosition && i < textPosition+text.length) {
				result += text[i-textPosition];
			} else {
				if (value/max*length >= i) result += "=";
				else result += " ";
			}
		}
		return result;
	}

	utils.getChangelog = function() {
		delete require.cache[require.resolve("../changelog.js")];
		let changelog = require("../changelog.js");
		let result = [];
		for (let entry of changelog.slice(0, 10)) {
			let date = new Date(entry.date);
			let dateString = date.toDateString()+" @ "+date.toTimeString().split(":").slice(0, 2).join(":");
			result.push("`» "+dateString+" — "+client.users.get(entry.authorID).username+"`\n"+entry.text);
		}
		return result.join("\n");
	}

	return {};
}