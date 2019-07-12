const Discord = require("discord.js");
const events = require("events");
const util = require("util");
const Jimp = require("jimp");
const path = require("path");

require("../types.js");

const startingCoins = 5000
let utilsResultCache;

/**
 * @param {PassthroughType} passthrough
 */
module.exports = (passthrough) => {
	let { client, db, reloadEvent, queueManager } = passthrough;

	if (!utilsResultCache) {
		var utils = {
			DMUser: class DMUser {
				/**
				 * @param {Discord.Snowflake} userID
				 */
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
			},
			BetterTimeout: class BetterTimeout {
				/**
				 * @param {Function} callback
				 * @param {Number} delay
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
				triggerNow() {
					this.clear();
					this.callback();
				}
				clear() {
					this.isActive = false;
					clearTimeout(this.timeout);
				}
			},
			JIMPStorage: class JIMPStorage {
				constructor() {
					/**
					 * @type {Map<String, any>}
					 */
					this.store = new Map();
				}
				/**
				 * @param {String} name
				 * @param {String} type
				 * @param {String} value
				 */
				save(name, type, value) {
					if (type == "file") {
						let promise = Jimp.read(value);
						this.savePromise(name, promise);
					} else if (type == "font") {
						let promise = Jimp.loadFont(value);
						this.savePromise(name, promise);
					}
				}
				/**
				 * @param {String} name
				 * @param {Promise<Jimp>} promise
				 * @returns {Promise<Jimp>}
				 */
				savePromise(name, promise) {
					this.store.set(name, promise);
					promise.then(result => {
						this.store.set(name, result);
					});
				}
				/**
				 * @param {String} name
				 * @returns {Promise<Jimp>}
				 */
				get(name) {
					let value = this.store.get(name);
					if (value instanceof Promise) return value;
					else return Promise.resolve(value);
				}
				/**
				 * @param {Array<String>} names
				 * @returns {Promise<Map<String, Jimp>>}
				 */
				getAll(names) {
					let result = new Map();
					return Promise.all(names.map(name =>
						this.get(name).then(value => result.set(name, value))
					)).then(() => result);
				}
			},
			sql: {
				/**
				 * @param {String} statement
				 * @param {Array<any>} prepared
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
				 * @param {String} statement
				 * @param {Array<any>} prepared
				 */
				"get": async function(string, prepared, connection) {
					return (await utils.sql.all(string, prepared, connection))[0];
				}
			},
			/**
			 * @returns {any}
			 */
			getConnection: function() {
				return db.getConnection();
			},
			settings: {
				/**
				 * @param {Discord.Snowflake} ID
				 */
				get: async function(ID) {
					let st = await utils.sql.get("SELECT * FROM settings WHERE userID =? OR guildID =?", [ID, ID]);
					if (!st) return false;
					return { waifuAlert: st.waifuAlert, gamblingAlert: st.gamblingAlert };
				},
				/**
				 * @param {Discord.Snowflake} ID
				 * @param {String} type
				 * @param {String} setting
				 * @param {any} value
				 */
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
			},
			waifu: {
				/**
				 * @param {Discord.Snowflake} userID
				 * @param {Object} options
				 * @param {Boolean} options.basic
				 */
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
				/**
				 * @param {Discord.Snowflake} claimer
				 * @param {Discord.Snowflake} claimed
				 * @param {Number} price
				 */
				bind: async function(claimer, claimed, price) {
					await Promise.all([
						utils.sql.all("DELETE FROM waifu WHERE userID = ? OR waifuID = ?", [claimer, claimed]),
						utils.coinsManager.award(claimer, -price)
					]);
					return utils.sql.all("INSERT INTO waifu VALUES (?, ?, ?)", [claimer, claimed, price]);
				},
				/**
				 * @param {Discord.Snowflake} user
				 * @returns {Promise<undefined>}
				 */
				unbind: async function(user) {
					await utils.sql.all("DELETE FROM waifu WHERE userID = ?", [user]);
					return undefined;
				},
				/**
				 * @param {Discord.Snowflake} user
				 * @param {Number} amount
				 * @returns {Promise<undefined>}
				 */
				transact: async function(user, amount) {
					let waifu = await this.get(user, { basic: true });
					await utils.sql.all("UPDATE waifu SET price =? WHERE userID =?", [waifu.price + amount, user]);
					return undefined;
				}
			},
			coinsManager: {
				/**
				 * @param {Discord.Snowflake} userID
				 * @returns {Promise<Number>}
				 */
				"get": async function(userID) {
					let row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID);
					if (row) return row.coins;
					else {
						await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [userID, startingCoins]);
						return startingCoins;
					}
				},
				/**
				 * @param {Discord.Snowflake} userID
				 * @param {Number} value
				 */
				"set": async function(userID, value) {
					let row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID);
					if (row) {
						await utils.sql.all("UPDATE money SET coins = ? WHERE userID = ?", [value, userID]);
					} else {
						await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [userID, value]);
					}
					return;
				},
				/**
				 * @param {Discord.Snowflake} userID
				 * @param {Number} value
				 */
				"award": async function(userID, value) {
					let row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID);
					if (row) {
						await utils.sql.all("UPDATE money SET coins = ? WHERE userID = ?", [row.coins + value, userID]);
					} else {
						await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [userID, startingCoins + value]);
					}
				}
			},
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
			 * @param {events.EventEmitter} target
			 * @param {String} name
			 * @param {String} filename
			 * @param {Function} code
			 */
			addTemporaryListener: function(target, name, filename, code) {
				console.log("added event "+name);
				target.on(name, code);
				reloadEvent.once(filename, () => {
					target.removeListener(name, code);
					console.log("removed event "+ name);
				});
			},
			/**
			 * @returns {Promise<Boolean>}
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
			/**
			 * @param {Discord.Snowflake} userID
			 * @param {String} command
			 * @param {Object} info
			 * @param {Number} info.max
			 * @param {Number} info.min
			 * @param {Number} info.step
			 * @param {Object} info.regen
			 * @param {Number} info.regen.time
			 * @param {Number} info.regen.amount
			 */
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
			 * @param {Number} length
			 * @param {Number} value
			 * @param {Number} max
			 * @param {String} text
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
				return "​" + result; // zwsp + result
			},
			/**
			 * @param {any} data
			 * @param {Number} depth
			 * @returns {String}
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
			/**
			 * @param {Discord.Guild} guild
			 * @param {any} entry
			 */
			addMusicLogEntry: function(guild, entry) {
				if (!guild.musicLog) guild.musicLog = [];
				guild.musicLog.unshift(entry);
				if (guild.musicLog.length > 15) guild.musicLog.pop();
			},
			/**
			 * @param {Date} when
			 * @param {String} seperator
			 */
			getSixTime: function(when, seperator) {
				let d = new Date(when || Date.now());
				if (!seperator) seperator = "";
				return d.getHours().toString().padStart(2, "0")+seperator+d.getMinutes().toString().padStart(2, "0")+seperator+d.getSeconds().toString().padStart(2, "0");
			},
			sp: function(object, properties) {
				let list = properties.split(".");
				let result = this;
				list.forEach(p => {
					if (result) result = result[p];
					else result = undefined;
				});
				return result;
			}
		}

		Object.defineProperty(Discord.Guild.prototype, "queue", {
			get: function() { return queueManager.storage.get(this.id); },
			configurable: true
		});

		utilsResultCache = utils;
	} else {
		var utils = utilsResultCache;
	}

	return utils;
}