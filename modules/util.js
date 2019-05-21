const util = require("util");
const Discord = require("discord.js");
const startingCoins = 5000;
require("../types.js");

let utils = {
	waifuGifts: {
		"Flowers": {
			price: 800,
			value: 800,
			emoji: "🌻",
			description: "What better way to show your affection?"
		},
		"Cupcake": {
			price: 2000,
			value: 2100,
			emoji: "<:cupcake:501568778891427840>",
			description: "Yum!"
		},
		"Thigh highs": {
			price: 5000,
			value: 5500,
			emoji: "<:socks:501569760559890432>",
			description: "Loved by catgirls everywhere."
		},
		"Soft toy": {
			price: 20000,
			value: 22500,
			emoji: "🐻",
			description: "Something to snuggle up to."
		},
		"Fancy dinner": {
			price: 40000,
			value: 46000,
			emoji: "🍝",
			description: "Table for two, please."
		},
		"Expensive pudding": {
			price: 50000,
			value: 58000,
			emoji: "🍨",
			description: "Worth every penny."
		},
		"Trip to Timbuktu": {
			price: 250000,
			value: 300000,
			emoji: "✈",
			description: "A moment to never forget."
		}
	},
	/**
	 * An object-oriented improvement upon setTimeout
	 */
	BetterTimeout: class BetterTimeout {
		/**
		 * A better version of global#setTimeout
		 * @param {Function} callback Function to execute when the timer expires
		 * @param {Number} delay Time in milliseconds to set the timer for
		 * @constructor
		 */
		constructor(callback, delay) {
			this.callback = callback;
			this.delay = delay;
			if (this.callback) {
				this.isActive = true;
				this.timeout = setTimeout(this.callback, this.delay);
			} else {
				this.isActive = false;
				this.timeout = null;
			}
		}
		/**
		 * Trigger the timeout early. It won't execute again.
		 */
		triggerNow() {
			this.clear();
			this.callback();
		}
		/**
		 * Clear the timeout. It won't execute at all.
		 */
		clear() {
			this.isActive = false;
			clearTimeout(this.timeout);
		}
	},
	/** Class representing a manager for music queues */
	queueStorage: {
		storage: new Discord.Collection(),
		addQueue(queue) {
			this.storage.set(queue.id, queue);
		}
	},
	/**
	 * Checks if a user or guild has certain permission levels
	 * @param {(Discord.User|Discord.Guild)} Object An Object of a Discord.User or Discord.Guild
	 * @param {String} Permission The permission to test if the Snowflake has
	 * @returns {Boolean} If the Snowflake is allowed to use the provided String permission
	 */
	hasPermission: async function() {
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
	},
	coinsManager: {
		"get": async function(userID) {
			let row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID);
			if (row) return row.coins;
			else {
				await utils.sql.all("INSERT INTO money VALUES (?, ?)", [userID, startingCoins]);
				return startingCoins;
			}
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
	},
	cooldownManager: async function(userID, command, info) {
		let winChance = info.max;
		let cooldown = await utils.sql.get("SELECT * FROM MoneyCooldown WHERE userID = ? AND command = ?", [userID, command]);
		if (cooldown) {
			winChance = Math.max(info.min, Math.min(info.max, cooldown.value + Math.floor((Date.now()-cooldown.date)/info.regen.time)*info.regen.amount));
			let newValue = winChance - info.step;
			utils.sql.all("UPDATE MoneyCooldown SET date = ?, value = ? WHERE userID = ? AND command = ?", [Date.now(), newValue, userID, command]);
		} else {
			utils.sql.all("INSERT INTO MoneyCooldown VALUES (NULL, ?, ?, ?, ?)", [userID, command, Date.now(), info.max - info.step]);
		}
		return winChance;
	},
	/**
	 * Creates a progress bar
	 */
	progressBar: function(length, value, max, text) {
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
	},
	/**
	 * Convert anything to a format suitable for sending as a Discord.Message.
	 * @param {*} data Something to convert
	 * @param {Number} depth The depth of the stringification
	 * @returns {String} The result of the conversion
	 */
	stringify: async function(data, depth) {
		if (!depth) depth = 0;
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
		} else result = "```js\n"+util.inspect(data, { depth: depth })+"```";

		if (result.length >= 2000) {
			if (result.startsWith("```")) {
				result = result.slice(0, 1995).replace(/`+$/, "").replace(/\n\s+/ms, "")+"…```";
			} else {
				result = result.slice(0, 1998)+"…";
			}
		}
		return result;
	},
	addMusicLogEntry: function(guild, entry) {
		if (!guild.musicLog) guild.musicLog = [];
		guild.musicLog.unshift(entry);
		if (guild.musicLog.length > 15) guild.musicLog.pop();
	},
	getSixTime: function(when, seperator) {
		let d = new Date(when || Date.now());
		if (!seperator) seperator = "";
		return d.getHours().toString().padStart(2, "0")+seperator+d.getMinutes().toString().padStart(2, "0")+seperator+d.getSeconds().toString().padStart(2, "0");
	}
}

module.exports = utils;