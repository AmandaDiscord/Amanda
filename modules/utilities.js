const Discord = require("discord.js");
const events = require("events");
let reactionMenus = {};
require("../types.js");

/**
 * @param {PassthroughType} passthrough
 */
module.exports = (passthrough) => {
	let { client, db, utils, reloadEvent } = passthrough;

	client.on("messageReactionAdd", reactionEvent);
	reloadEvent.once(__filename, () => {
		client.removeListener("messageReactionAdd", reactionEvent);
	});

	/**
	 * Handles reactions as actions for the Discord.Client to perform
	 * @param {Array} actions An Array of Objects of actions
	 */
	Discord.Message.prototype.reactionMenu = function(actions) {
		let message = this;
		return new ReactionMenu(message, actions);
	}

	/**
 * Class that initiates a Discord.Message reaction menu
 */
class ReactionMenu {
	/**
	 * Create a new ReactionMenu
	 * @param {Discord.Message} message
	 * @param {Array} actions
	 */
	constructor(message, actions) {
		this.message = message;
		this.actions = actions;
		reactionMenus[this.message.id] = this;
		this.promise = this.react();
	}
	async react() {
		for (let a of this.actions) {
			a.messageReaction = await this.message.react(a.emoji).catch(new Function());
		}
	}
	destroy(remove) {
		delete reactionMenus[this.message.id];
		if (remove) {
			if (this.message.channel.type == "text") {
				this.message.clearReactions().catch(new Function());
			} else if (this.message.channel.type == "dm") {
				this.actions.forEach(a => {
					if (a.messageReaction) a.messageReaction.remove().catch(new Function());
				});
			}
		}
	}
}

	/**
	 * Main interface for MySQL connection
	 */
	utils.sql = {
		/**
		 * Executes an SQL statement
		 * @param {String} statement The SQL statement
		 * @param {Array} prepared An array of values that coresponds with the SQL statement
		 */
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
		/**
		 * Gets a row based on the SQL statement
		 * @param {String} statement The SQL statement
		 * @param {Array} prepared An array of values that coresponds with the SQL statement
		 */
		"get": async function(string, prepared, connection) {
			return (await utils.sql.all(string, prepared, connection))[0];
		}
	}

	/**
	 * Gets the connection to the MySQL database
	 * @returns {Promise<Object>} Database Connection
	 */
	utils.getConnection = function() {
		return db.getConnection();
	}

	/**
	 * Fetches a Discord.User then queues messages to be sent to them
	 * @param {String} userID A Discord.User ID
	 */
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
			return new Promise((resolve, reject) => {
				return new Promise(fetched => {
					if (!this.user) this.events.once("fetched", fetched);
					else fetched();
				}).then(() => {
					try {
						this.user.send(...arguments).then(resolve);
					} catch (reason) {
						reject(`${this.user.tag} cannot recieve messsages from this client`);
					}
				});
			});
		}
	}
	utils.DMUser = DMUser;

	utils.settings = {
		get: async function(ID) {
			let st = await utils.sql.get("SELECT * FROM settings WHERE userID =? OR guildID =?", [ID, ID]);
			if (!st) return false;
			return { waifuAlert: st.waifuAlert, gamblingAlert: st.gamblingAlert };
		},
		set: async function(ID, type, setting, value) {
			let st = await utils.settings.get(ID);
			if (type == "user") {
				if (!st) await utils.sql.all("INSERT INTO settings (userID, waifuAlert, gamblingAlert) VALUES (?, ?, ?)", [ID, 1, 1]);
				if (setting == "waifuAlert") return await utils.sql.all("UPDATE settings SET waifuAlert =? WHERE userID =?", [value, ID]);
				if (setting == "gamblingAlert") return await utils.sql.all("UPDATE settings SET gamblingAlert =? WHERE userID =?", [value, ID]);
			}
			if (type == "guild") {
				if (!st) await utils.sql.all("INSERT INTO settings (guildID, waifuAlert, gamblingAlert) VALUES (?, ?, ?)", [ID, 1, 1]);
				if (setting == "waifuAlert") return await utils.sql.all("UPDATE settings SET waifuAlert =? WHERE guildID =?", [value, ID]);
				if (setting == "gamblingAlert") return await utils.sql.all("UPDATE settings SET gamblingAlert =? WHERE guildID =?", [value, ID]);
			}
		}
	}

	utils.waifu = {
		get: async function(userID, options) {
			const emojiMap = {
				"Flowers": "🌻",
				"Cupcake": "<:cupcake:501568778891427840>",
				"Thigh highs": "<:socks:501569760559890432>",
				"Soft toy": "🐻",
				"Fancy dinner": "🍝",
				"Expensive pudding": "🍨",
				"Trip to Timbuktu": "✈"
			}
			if (options) {
				if (typeof options == "object") {
					let { basic } = options;
					if (basic) {
						let info = await utils.sql.get("SELECT * FROM waifu WHERE userID =?", userID);
						return info;
					}
				}
			}
			let [meRow, claimerRow, receivedGifts, sentGifts] = await Promise.all([
				utils.sql.get("SELECT waifuID, price FROM waifu WHERE userID = ?", userID),
				utils.sql.get("SELECT userID, price FROM waifu WHERE waifuID = ?", userID),
				utils.sql.all("SELECT senderID, type FROM WaifuGifts WHERE receiverID = ?", userID),
				utils.sql.all("SELECT receiverID, type FROM WaifuGifts WHERE senderID = ?", userID)
			]);
			let claimer = claimerRow ? await client.fetchUser(claimerRow.userID) : undefined;
			let price = claimerRow ? Math.floor(claimerRow.price * 1.25) : 0;
			let waifu = meRow ? await client.fetchUser(meRow.waifuID) : undefined;
			let waifuPrice = meRow ? Math.floor(meRow.price * 1.25) : 0;
			let gifts = {
				received: {
					list: receivedGifts.map(g => g.type),
					emojis: receivedGifts.map(g => utils.waifuGifts[g.type].emoji).join("").replace(/(.{10})/g, "$1\n").trim()
				},
				sent: {
					list: sentGifts.map(g => g.type),
					emojis: sentGifts.map(g => utils.waifuGifts[g.type].emoji).join("").replace(/(.{10})/g, "$1\n").trim()
				}
			}
			return { claimer, price, waifu, waifuPrice, gifts };
		},
		bind: async function(claimer, claimed, price) {
			await Promise.all([
				utils.sql.all("DELETE FROM waifu WHERE userID = ? OR waifuID = ?", [claimer, claimed]),
				utils.coinsManager.award(claimer, -price)
			]);
			return utils.sql.all("INSERT INTO waifu VALUES (?, ?, ?)", [claimer, claimed, price]);
		},
		unbind: async function(user) {
			await utils.sql.all("DELETE FROM waifu WHERE userID = ?", [user]);
			return undefined;
		},
		transact: async function(user, amount) {
			let waifu = await this.get(user, { basic: true });
			await utils.sql.all("UPDATE waifu SET price =? WHERE userID =?", [waifu.price + amount, user]);
			return undefined;
		}
	}
	Object.defineProperty(utils.waifu, "all", {
		get: async function() {
			let all = await utils.sql.all("SELECT * FROM waifu WHERE userID !=? ORDER BY price DESC LIMIT 10", client.user.id);
			return all;
		}
	});

	utils.addTemporaryListener = function(target, name, filename, code) {
		target.on(name, code);
		reloadEvent.once(filename, () => {
			target.removeListener(name, code);
		});
	}

	function reactionEvent(messageReaction, user) {
		let id = messageReaction.messageID;
		let emoji = messageReaction.emoji;
		if (user.id == client.user.id) return;
		let menu = reactionMenus[id];
		if (!menu) return;
		let msg = menu.message;
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
			menu.destroy(true);
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
			menu.destroy(true);
			msg.delete();
			break;
		}
	}
}