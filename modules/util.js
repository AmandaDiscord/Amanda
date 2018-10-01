let util = require("util");
const events = require("events");
let reactionMenus = {};

module.exports = (passthrough) => {
	let { Discord, client, db, utils, reloadEvent } = passthrough;
	client.on("messageReactionAdd", reactionEvent);
	reloadEvent.once(__filename, () => {
		client.removeListener("messageReactionAdd", reactionEvent);
	});

	/**
	 * Finds a member in a guild
	 * @param {*} msg MessageResolvable
	 * @param {String} usertxt Text that contains user's display data to search them by
	 * @param {Boolean} self If the function should return <MessageResolvable>.member if no usertxt is provided
	 * @returns {(Member|null)} A member object or null if it couldn't find a member
	 */
	Discord.Guild.prototype.findMember = function(msg, usertxt, self = false) {
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
			return this.members.get(usertxt) || matchFunctions.map(f => {
				return this.members.find(m => f(m));
			}).find(m => m) || null;
		}
	}

	/**
	 * Sends a typing event to a channel that times out
	 */
	Discord.Channel.prototype.sendTyping = async function() {
		if (this.startTyping) await this.client.rest.methods.sendTyping(this.id);
	}

	/**
	 * Sends a denying message to a text channel
	 * @param {*} msg MessageResolvable
	 * @returns {Promise} MessageResolvable
	 */
	Discord.Channel.prototype.sendNopeMessage = function() {
		return new Promise(async resolve => {
			let nope = [["No.", 300], ["Nice try.", 1000], ["How about no?", 1550], [`Don't even try it.`, 3000]];
			let [no, time] = nope[Math.floor(Math.random() * nope.length)];
			await this.sendTyping();
			setTimeout(() => { resolve(this.send(no)); }, time);
		});
	}

	/**
	 * Gets the 32×32 avatar URL of a user, useful for embed authors and footers
	 */
	Discord.User.prototype.__defineGetter__('smallAvatarURL', function() {
		if (this.avatar) return `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.png?size=32`;
		else return `https://cdn.discordapp.com/embed/avatars/${this.discriminator % 5}.png`;
	});

	/**
	 * Finds a user in the client cache
	 * @param {*} msg MessageResolvable
	 * @param {String} usertxt Text that contains user's display data to search them by
	 * @param {Boolean} self If the function should return <MessageResolvable>.author if no usertxt is provided
	 * @returns {(User|null)} A user object or null if it couldn't find a user
	 */
	Discord.Client.prototype.findUser = function(msg, usertxt, self = false) {
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
			result = await utils.sql.get(`SELECT ${permissionType} FROM UserPermissions WHERE userID = ?`, thing);
		} else if (thingType == "server" || thingType == "guild") {
			result = await utils.sql.get(`SELECT ${permissionType} FROM ServerPermissions WHERE serverID = ?`, thing);
		}
		if (result) result = Object.values(result)[0];
		if (permissionType == "music") return true;
		return !!result;
	}

	/**
	 * Main interface for MySQL connection
	 */
	utils.sql = {
		"all": function(string, prepared, connection, attempts) {
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
					if (attempts) utils.sql.all(string, prepared, connection, attempts).then(resolve).catch(reject);
					else reject(err);
				});
			});
		},
		"get": async function(string, prepared, connection) {
			return (await utils.sql.all(string, prepared, connection))[0];
		}
	}

	/**
	 * Gets the connection to the MySQL database
	 * @returns {*} Database Connection
	 */
	utils.getConnection = function() {
		return db.getConnection();
	}

	const startingCoins = 5000;
	utils.coinsManager = {
		"get": async function(userID) {
			let row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID);
			if (!row) {
				await utils.sql.all("INSERT INTO money VALUES (?, ?)", [userID, startingCoins]);
				row = await utils.coinsManager.get(userID);
			}
			return row.coins;
		},
		"set": async function(userID, value) {
			let row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID);
			if (row) {
				await utils.sql.all("UPDATE money SET coins = ? WHERE userID = ?", [value, userID]);
			} else {
				await utils.sql.all("INSERT INTO money VALUES (?, ?)", [userID, value]);
			}
			return;
		},
		"award": async function(userID, value) {
			let row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID);
			if (row) {
				await utils.sql.all("UPDATE money SET coins = ? WHERE userID = ?", [row.coins + value, userID]);
			} else {
				await utils.sql.all("INSERT INTO money VALUES (?, ?)", [userID, startingCoins + value]);
			}
		}
	}

	class DMUser {
		constructor(userID) {
			this.userID = userID;
			this.user = undefined;
			this.events = new events.EventEmitter();
			this.fetch();
		}
		fetch() {
			new Promise(resolve => {
				if (client.readyAt) resolve();
				else client.once("ready", () => resolve());
			}).then(() => {
				client.fetchUser(this.userID).then(user => {
					this.user = user;
					this.events.emit("fetched");
					this.events = undefined;
				});
			});
		}
		send() {
			return new Promise(resolve => {
				return new Promise(fetched => {
					if (!this.user) this.events.once("fetched", () => fetched());
					else fetched();
				}).then(() => {
					resolve(this.user.send(...arguments));
				});
			});
		}
	}
	utils.DMUser = DMUser;

	/**
	 * Handles reactions as actions for the client to perform
	 * @param {*} msg MessageResolvable
	 * @param {Array} actions An array of objects of actions
	 */
	Discord.Message.prototype.reactionMenu = async function(actions) {
		reactionMenus[this.id] = {
			actions: actions
		}
		for (let a of actions) {
			await this.react(a.emoji);
		}
	}

	/**
	 * Gets the URL of any Discord emoji
	 */
	Discord.Client.prototype.parseEmoji = getEmoji;
	function getEmoji(emoji) {
		let type, e;
		e = Discord.Util.parseEmoji(emoji);
		if (e == null) return null;
		if (e.id == undefined) return null;
		if (e.animated) type = "gif";
		else type = "png";
		return { animated: e.animated, name: e.name, id: e.id, url: `https://cdn.discordapp.com/emojis/${e.id}.${type}` };
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
	 * Humanizes a number to a time string based on input
	 * @param {string} format What format the number is in; sec or ms
	 * @returns {string} A humanized string of time
	 */
	Number.prototype.humanize = function(format) {
		let msec;
		if (!format) throw new RangeError("No Input was provided");
		if (format.toLowerCase() == "ms") msec = Math.floor(this);
		else if (format.toLowerCase() == "sec") msec = Math.floor(this * 1000);
		else throw new TypeError("Invalid format provided");
		if (isNaN(msec)) throw new TypeError("Input provided is NaN");
		let days = Math.floor(msec / 1000 / 60 / 60 / 24);
		msec -= days * 1000 * 60 * 60 * 24;
		let hours = Math.floor(msec / 1000 / 60 / 60);
		msec -= hours * 1000 * 60 * 60;
		let mins = Math.floor(msec / 1000 / 60);
		msec -= mins * 1000 * 60;
		let secs = Math.floor(msec / 1000);
		let timestr = "";
		if (days > 0) timestr += days + "d ";
		if (hours > 0) timestr += hours + "h ";
		if (mins > 0) timestr += mins + "m ";
		if (secs > 0) timestr += secs + "s";
		return timestr;
	}


	/**
	 * Changes a presence string into an emoji
	 * @param {String} presence The user's presence string
	 * @returns {String} The emoji that matches that presence
	 */
	Discord.User.prototype.__defineGetter__("presenceEmoji", function() {
		let presences = {
			online: "<:online:453823508200554508>",
			idle: "<:idle:453823508028456971>",
			dnd: "<:dnd:453823507864748044>",
			offline: "<:invisible:453827513995755520>"
		};
		return presences[this.presence.status];
	});
	Discord.GuildMember.prototype.__defineGetter__("presenceEmoji", function() {
		let presences = {
			online: "<:online:453823508200554508>",
			idle: "<:idle:453823508028456971>",
			dnd: "<:dnd:453823507864748044>",
			offline: "<:invisible:453827513995755520>"
		};
		return presences[this.presence.status];
	});


	/**
	 * Changes a presence type integer to a prefix string
	 * @param {Number} type The user's presence integer
	 * @returns {String} The prefix that matches the presence type
	 */
	Discord.User.prototype.__defineGetter__("presencePrefix", function() {
		if (this.presence.game == null) return null;
		let prefixes = ["Playing", "Streaming", "Listening to", "Watching"];
		return prefixes[this.presence.game.type];
	});
	Discord.GuildMember.prototype.__defineGetter__("presencePrefix", function() {
		if (this.presence.game == null) return null;
		let prefixes = ["Playing", "Streaming", "Listening to", "Watching"];
		return prefixes[this.presence.game.type];
	});

	/**
	 * Creates a progress bar
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
				else result += " ​"; // space + zwsp to prevent shrinking
			}
		}
		return result;
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
		} else result = "```js\n"+util.inspect(data, { depth: 0 })+"```";

		if (result.length >= 2000) {
			if (result.startsWith("```")) {
				result = result.slice(0, 1995).replace(/`+$/, "").replace(/\n\s+/ms, "")+"…```";
			} else {
				result = result.slice(0, 1998)+"…";
			}
		}
		return result;
	}

	function reactionEvent(messageReaction, user) {
		let msg = messageReaction.message;
		let emoji = messageReaction.emoji;
		if (user.id == client.user.id) return;
		let menu = reactionMenus[msg.id];
		if (!menu) return;
		let action = menu.actions.find(a => a.emoji == emoji || (a.emoji.name == emoji.name && a.emoji.id == emoji.id));
		if (!action) return;
		if ((action.allowedUsers && !action.allowedUsers.includes(user.id)) || (action.deniedUsers && action.deniedUsers.includes(user.id))) {
			if (action.remove == "user") messageReaction.remove(user);
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
