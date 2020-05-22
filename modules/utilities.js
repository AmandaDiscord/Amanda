// @ts-check

const Discord = require("discord.js")
const events = require("events")
const util = require("util")
const path = require("path")
const Jimp = require("jimp")
const mysql = require("mysql2/promise")

const ReactionMenu = require("@amanda/reactionmenu")

const passthrough = require("../passthrough")
const { config, constants, client, db, reloadEvent } = passthrough

let Lang = require("@amanda/lang")

const startingCoins = 5000

const uncachedChannelSendBlacklist = new Set()

/**
 * @namespace
 */
const utils = {
	DMUser: class DMUser {
		/**
		 * @param {string} userID
		 */
		constructor(userID) {
			this.userID = userID
			/** @type {Discord.User} */
			this.user = undefined
			this.events = new events.EventEmitter()
			this.fetch()
		}
		/**
		 * @returns {Promise<void>}
		 */
		fetch() {
			return new Promise(resolve => {
				if (client.readyAt) resolve()
				else client.once("ready", () => resolve())
			}).then(() => {
				client.users.fetch(this.userID).then(user => {
					this.user = user
					this.events.emit("fetched")
					this.events = undefined
				})
			})
		}
		/**
		 * @param {any} content
		 * @param {Discord.MessageEmbed|Discord.MessageOptions|Discord.MessageAttachment|Array<(Discord.MessageEmbed|Discord.MessageAttachment)>} [options]
		 * @returns {Promise<Discord.Message>}
		 */
		send(content, options) {
			return new Promise((resolve, reject) => {
				return new Promise(fetched => {
					if (!this.user) this.events.once("fetched", fetched)
					else fetched()
				}).then(() => {
					try {
						this.user.send(content, options).then(resolve)
					} catch (reason) {
						reject(new Error(`${this.user.tag} cannot recieve messages from this client`))
					}
				})
			})
		}
	},
	BetterTimeout: class BetterTimeout {
		constructor() {
			this.callback = null
			/** @type {number} */
			this.delay = null
			this.isActive = false
			this.timeout = null
		}
		setCallback(callback) {
			this.clear()
			this.callback = callback
			return this
		}
		/**
		 * @param {number} delay
		 */
		setDelay(delay) {
			this.clear()
			this.delay = delay
			return this
		}
		run() {
			this.clear()
			if (this.callback && this.delay) {
				this.isActive = true
				this.timeout = setTimeout(() => this.callback(), this.delay)
			}
		}
		triggerNow() {
			this.clear()
			if (this.callback) this.callback()
		}
		clear() {
			this.isActive = false
			clearTimeout(this.timeout)
		}
	},
	JIMPStorage:
	/**
	 * @template T
	 */
	class JIMPStorage {
		constructor() {
			/**
			 * @type {Map<string, T>}
			 */
			this.store = new Map()
		}
		/**
		 * @param {string} name
		 * @param {"file"|"font"} type
		 * @param {string} value
		 */
		save(name, type, value) {
			if (type == "file") {
				const promise = Jimp.read(value)
				// @ts-ignore
				this.savePromise(name, promise)
			} else if (type == "font") {
				const promise = Jimp.loadFont(value)
				// @ts-ignore
				this.savePromise(name, promise)
			}
		}
		/**
		 * @param {string} name
		 * @param {Promise<T>} promise
		 */
		savePromise(name, promise) {
			// @ts-ignore
			this.store.set(name, promise)
			promise.then(result => {
				this.store.set(name, result)
			})
		}
		/**
		 * @param {string} name
		 * @returns {Promise<T>}
		 */
		get(name) {
			const value = this.store.get(name)
			if (value instanceof Promise) return value
			else return Promise.resolve(value)
		}
		/**
		 * @param {Array<string>} names
		 * @returns {Promise<Map<string, T>>}
		 */
		async getAll(names) {
			const result = new Map()
			await Promise.all(names.map(name => this.get(name).then(value => result.set(name, value))))
			return result
		}
	},
	sql: {
		/**
		 * @param {string} string
		 * @param {string|number|symbol|Array<(string|number|symbol)>} [prepared=undefined]
		 * @param {mysql.Pool|mysql.PoolConnection} [connection=undefined]
		 * @param {number} [attempts=2]
		 * @returns {Promise<Array<mysql.RowDataPacket>>}
		 */
		"all": function(string, prepared = undefined, connection = undefined, attempts = 2) {
			// @ts-ignore
			if (!connection) connection = db
			if (prepared !== undefined && typeof (prepared) != "object") prepared = [prepared]
			return new Promise((resolve, reject) => {
				if (Array.isArray(prepared) && prepared.includes(undefined)) return reject(new Error(`Prepared statement includes undefined\n	Query: ${string}\n	Prepared: ${util.inspect(prepared)}`))
				connection.execute(string, prepared).then(result => {
					const rows = result[0]
					// @ts-ignore
					resolve(rows)
				}).catch(err => {
					console.error(err)
					attempts--
					if (attempts) utils.sql.all(string, prepared, connection, attempts).then(resolve).catch(reject)
					else reject(err)
				})
			})
		},
		/**
		 * @param {string} string
		 * @param {string|number|symbol|Array<(string|number|symbol)>} [prepared=undefined]
		 * @param {mysql.Pool|mysql.PoolConnection} [connection=undefined]
		 * @returns {Promise<mysql.RowDataPacket>}
		 */
		"get": async function(string, prepared = undefined, connection = undefined) {
			return (await utils.sql.all(string, prepared, connection))[0]
		}
	},
	getConnection: function() {
		return db.getConnection()
	},
	waifu: {
		/**
		 * @param {string} userID
		 * @param {{basic: boolean}} [options]
		 * @returns {Promise<{claimer: Discord.User, price: number, waifu: Discord.User, waifuID?: string, userID?: string, waifuPrice: number, gifts: {received: {list: Array<any>, emojis: string}, sent: {list: Array<any>, emojis: string}}}>}
		 */
		get: async function(userID, options) {
			/* const emojiMap = {
				"Flowers": "🌻",
				"Cupcake": "<:cupcake:501568778891427840>",
				"Thigh highs": "<:socks:501569760559890432>",
				"Soft toy": "🐻",
				"Fancy dinner": "🍝",
				"Expensive pudding": "🍨",
				"Trip to Timbuktu": "✈"
			}*/
			if (options) {
				if (typeof options == "object") {
					const { basic } = options
					if (basic) {
						const info = await utils.sql.get("SELECT * FROM waifu WHERE userID =?", userID)
						// @ts-ignore
						return info
					}
				}
			}
			const [meRow, claimerRow, receivedGifts, sentGifts] = await Promise.all([
				utils.sql.get("SELECT waifuID, price FROM waifu WHERE userID = ?", userID),
				utils.sql.get("SELECT userID, price FROM waifu WHERE waifuID = ?", userID),
				utils.sql.all("SELECT senderID, type FROM WaifuGifts WHERE receiverID = ?", userID),
				utils.sql.all("SELECT receiverID, type FROM WaifuGifts WHERE senderID = ?", userID)
			])
			const claimer = claimerRow ? await client.users.fetch(claimerRow.userID) : undefined
			const price = claimerRow ? Math.floor(claimerRow.price * 1.25) : 0
			const waifu = meRow ? await client.users.fetch(meRow.waifuID) : undefined
			const waifuPrice = meRow ? Math.floor(meRow.price * 1.25) : 0
			const gifts = {
				received: {
					list: receivedGifts.map(g => g.type),
					emojis: receivedGifts.map(g => utils.waifuGifts[g.type].emoji).join("").replace(/(.{10})/g, "$1\n").trim()
				},
				sent: {
					list: sentGifts.map(g => g.type),
					emojis: sentGifts.map(g => utils.waifuGifts[g.type].emoji).join("").replace(/(.{10})/g, "$1\n").trim()
				}
			}
			return { claimer, price, waifu, waifuPrice, gifts }
		},
		/**
		 * @param {string} claimer
		 * @param {string} claimed
		 * @param {number} price
		 */
		bind: async function(claimer, claimed, price) {
			await Promise.all([
				utils.sql.all("DELETE FROM waifu WHERE userID = ? OR waifuID = ?", [claimer, claimed]),
				utils.coinsManager.award(claimer, -price)
			])
			void await utils.sql.all("INSERT INTO waifu VALUES (?, ?, ?)", [claimer, claimed, price])
		},
		/**
		 * @param {string} user
		 */
		unbind: async function(user) {
			void await utils.sql.all("DELETE FROM waifu WHERE userID = ?", [user])
		},
		/**
		 * @param {string} user
		 * @param {number} amount
		 */
		transact: async function(user, amount) {
			const waifu = await this.get(user, { basic: true })
			void await utils.sql.all("UPDATE waifu SET price =? WHERE userID =?", [waifu.price + amount, user])
		}
	},
	coinsManager: {
		/**
		 * @param {string} userID
		 * @returns {Promise<number>}
		 */
		get: async function(userID) {
			const row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID)
			if (row) return row.coins
			else {
				await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [userID, startingCoins])
				return startingCoins
			}
		},
		/**
		 * @param {string} userID
		 * @param {number} value
		 */
		set: async function(userID, value) {
			const row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID)
			if (row) void utils.sql.all("UPDATE money SET coins = ? WHERE userID = ?", [value, userID])
			else void await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [userID, value])
		},
		/**
		 * @param {string} userID
		 * @param {number} value
		 */
		award: async function(userID, value) {
			const row = await utils.sql.get("SELECT * FROM money WHERE userID = ?", userID)
			if (row) void await utils.sql.all("UPDATE money SET coins = ? WHERE userID = ?", [row.coins + value, userID])
			else void await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [userID, startingCoins + value])
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
	 * @param {string} name
	 * @param {string} filename
	 * @param {(...args: Array<any>) => any} code
	 */
	addTemporaryListener: function(target, name, filename, code, targetListenMethod = "on") {
		console.log(`added event ${name}`)
		target[targetListenMethod](name, code)
		reloadEvent.once(filename, () => {
			target.removeListener(name, code)
			console.log(`removed event ${name}`)
		})
	},
	/**
	 * @param {Discord.User} user
	 * @param {"eval"|"owner"} permission
	 * @returns {Promise<boolean>}
	 */
	hasPermission: async function(user, permission) {
		let result = await utils.sql.get(`SELECT ${permission} FROM UserPermissions WHERE userID = ?`, user.id)
		if (result) result = Object.values(result)[0]
		return !!result
	},
	/**
	 * @param {string} userID
	 * @param {string} command
	 * @param {{ max: number, min: number, step: number, regen: { time: number, amount: number }}} info
	 */
	cooldownManager: async function(userID, command, info) {
		let winChance = info.max
		const cooldown = await utils.sql.get("SELECT * FROM MoneyCooldown WHERE userID = ? AND command = ?", [userID, command])
		if (cooldown) {
			winChance = Math.max(info.min, Math.min(info.max, cooldown.value + Math.floor((Date.now() - cooldown.date) / info.regen.time) * info.regen.amount))
			const newValue = winChance - info.step
			utils.sql.all("UPDATE MoneyCooldown SET date = ?, value = ? WHERE userID = ? AND command = ?", [Date.now(), newValue, userID, command])
		} else utils.sql.all("INSERT INTO MoneyCooldown VALUES (NULL, ?, ?, ?, ?)", [userID, command, Date.now(), info.max - info.step])
		return winChance
	},
	/**
	 * @param {number} length
	 * @param {number} value
	 * @param {number} max
	 * @param {string} [text=""]
	 */
	progressBar: function(length, value, max, text) {
		if (!text) text = ""
		const textPosition = Math.floor(length / 2) - Math.ceil(text.length / 2) + 1
		let result = ""
		for (let i = 1; i <= length; i++) {
			if (i >= textPosition && i < textPosition + text.length) {
				result += text[i - textPosition]
			} else {
				// eslint-disable-next-line no-lonely-if
				if (value / max * length >= i) result += "="
				else result += " ​" // space + zwsp to prevent shrinking
			}
		}
		return "​" + result // zwsp + result
	},
	/**
	 * @param {any} data
	 * @param {number} [depth=0]
	 * @returns {Promise<string>}
	 */
	stringify: async function(data, depth = 0) {
		/** @type {string} */
		let result
		if (data === undefined) result = "(undefined)"
		else if (data === null) result = "(null)"
		else if (typeof (data) == "function") result = "(function)"
		else if (typeof (data) == "string") result = `"${data}"`
		else if (typeof (data) == "number") result = data.toString()
		else if (data instanceof Promise) return utils.stringify(await data, depth)
		else if (data.constructor && data.constructor.name && data.constructor.name.toLowerCase().includes("error")) {
			const errorObject = {}
			Object.entries(data).forEach(e => {
				errorObject[e[0]] = e[1]
			})
			result = `\`\`\`\n${data.stack}\`\`\` ${await utils.stringify(errorObject)}`
		} else result = `\`\`\`js\n${util.inspect(data, { depth: depth })}\`\`\``

		if (result.length >= 2000) {
			if (result.startsWith("```")) result = result.slice(0, 1995).replace(/`+$/, "").replace(/\n\s+/ms, "") + "…```"
			else result = `${result.slice(0, 1998)}…`
		}
		return result
	},

	/**
	 * @param {Date|string} when
	 * @param {string} seperator
	 */
	getSixTime: function(when, seperator) {
		const d = new Date(when || Date.now())
		if (!seperator) seperator = ""
		return d.getHours().toString().padStart(2, "0") + seperator + d.getMinutes().toString().padStart(2, "0") + seperator + d.getSeconds().toString().padStart(2, "0")
	},

	/**
	 * @param {T[]} items
	 * @param {string} startString One-based index
	 * @param {string} endString One-based index
	 * @param {boolean} shuffle Shuffle the result before returning
	 * @returns {T[]}
	 * @template T
	 */
	playlistSection: function(items, startString, endString, shuffle) {
		let from = startString == "-" ? 1 : (Number(startString) || 1)
		let to = endString == "-" ? items.length : (Number(endString) || from || items.length) // idk how to fix this
		from = Math.max(from, 1)
		to = Math.min(items.length, to)
		if (startString) items = items.slice(from - 1, to)
		if (shuffle) {
			utils.arrayShuffle(items)
		}
		if (!startString && !shuffle) items = items.slice() // make copy of array for consistent behaviour
		return items
	},

	/**
	 * @param {Discord.TextChannel} channel
	 * @param {string} authorID
	 * @param {string} title
	 * @param {string} failedTitle
	 * @param {string[]} items
	 * @param {Discord.MessageEmbed} [embed=undefined]
	 * @returns {Promise<number|null>} The zero-based index that was selected, or null if invalid response.
	 */
	makeSelection: async function(channel, authorID, title, failedTitle, items, embed = undefined) {
		// Set up embed
		if (!embed) embed = new Discord.MessageEmbed()
		embed.setTitle(title)
		embed.setDescription(items.join("\n"))
		embed.setColor(0x36393f)
		embed.setFooter(`Type a number from 1-${items.length} to select that item`)
		// Send embed
		const selectmessage = await channel.send(utils.contentify(channel, embed))
		// Make collector
		const collector = channel.createMessageCollector((m => m.author.id == authorID), { max: 1, time: 60000 })
		return collector.next.then(newmessage => {
			// Collector got a message
			let index = Number(newmessage.content)
			// Is index a number?
			if (isNaN(index)) throw new Error()
			index--
			// Is index in bounds?
			if (index < 0 || index >= items.length) throw new Error() // just head off to the catch
			// Edit to success
			embed.setDescription(`» ${items[index]}`)
			embed.setFooter("")
			selectmessage.edit(utils.contentify(selectmessage.channel, embed))
			return index
		}).catch(() => {
			// Collector failed, show the failure message and return null
			embed.setTitle(failedTitle)
			embed.setDescription("")
			embed.setFooter("")
			selectmessage.edit(utils.contentify(selectmessage.channel, embed))
			return null
		})
	},

	/** @param {Date} date */
	upcomingDate: function(date) {
		const currentHours = date.getUTCHours()
		let textHours = ""
		if (currentHours < 12) textHours += `${currentHours} AM`
		else textHours = `${currentHours - 12} PM`
		return `${date.toUTCString().split(" ").slice(0, 4).join(" ")} at ${textHours} UTC`
	},

	compactRows: {
		/**
		 * @param {Array<string>} rows
		 * @param {number} [maxLength=2000]
		 * @param {number} [joinLength=1]
		 * @param {string} [endString="…"]
		 */
		removeEnd: function(rows, maxLength = 2000, joinLength = 1, endString = "…") {
			let currentLength = 0
			const maxItems = 20
			for (let i = 0; i < rows.length; i++) {
				const row = rows[i]
				if (i >= maxItems || currentLength + row.length + joinLength + endString.length > maxLength) {
					return rows.slice(0, i).concat([endString])
				}
				currentLength += row.length + joinLength
			}
			return rows
		},

		/**
		 * @param {Array<string>} rows
		 * @param {number} [maxLength=2000]
		 * @param {number} [joinLength=1]
		 * @param {string} [middleString="…"]
		 */
		removeMiddle: function(rows, maxLength = 2000, joinLength = 1, middleString = "…") {
			let currentLength = 0
			let currentItems = 0
			const maxItems = 20
			/**
			 * Holds items for the left and right sides.
			 * Items should flow into the left faster than the right.
			 * At the end, the sides will be combined into the final list.
			 */
			const reconstruction = new Map([
				["left", []],
				["right", []]
			])
			let leftOffset = 0
			let rightOffset = 0
			function getNextDirection() {
				return rightOffset * 3 > leftOffset ? "left" : "right"
			}
			while (currentItems < rows.length) {
				const direction = getNextDirection()
				let row
				if (direction == "left") row = rows[leftOffset++]
				else row = rows[rows.length - 1 - rightOffset++]
				if (currentItems >= maxItems || currentLength + row.length + joinLength + middleString.length > maxLength) {
					return reconstruction.get("left").concat([middleString], reconstruction.get("right").reverse())
				}
				reconstruction.get(direction).push(row)
				currentLength += row.length + joinLength
				currentItems++
			}
			return reconstruction.get("left").concat(reconstruction.get("right").reverse())
		}
	},

	/**
	 * @param {string[]} rows
	 * @param {number} maxLength
	 * @param {number} itemsPerPage
	 * @param {number} itemsPerPageTolerance
	 */
	createPages: function(rows, maxLength, itemsPerPage, itemsPerPageTolerance) {
		const pages = []
		let currentPage = []
		let currentPageLength = 0
		const currentPageMaxLength = maxLength
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i]
			if ((currentPage.length >= itemsPerPage && rows.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
				pages.push(currentPage)
				currentPage = []
				currentPageLength = 0
			}
			currentPage.push(row)
			currentPageLength += row.length + 1
		}
		pages.push(currentPage)
		return pages
	},

	/**
	 * @param {string[][]} rows
	 * @param {any[]} align
	 * @param {(currentLine?: number) => string} surround
	 * @param {string} spacer
	 * @returns {string[]}
	 */
	tableifyRows: function(rows, align, surround = () => "", spacer = " ") { // SC: en space
		/** @type {string[]} */
		const output = []
		const maxLength = []
		for (let i = 0; i < rows[0].length; i++) {
			let thisLength = 0
			for (let j = 0; j < rows.length; j++) {
				if (thisLength < rows[j][i].length) thisLength = rows[j][i].length
			}
			maxLength.push(thisLength)
		}
		for (let i = 0; i < rows.length; i++) {
			let line = ""
			for (let j = 0; j < rows[0].length; j++) {
				if (align[j] == "left" || align[j] == "right") {
					line += surround(i)
					if (align[j] == "left") {
						const pad = " ​"
						const padding = pad.repeat(maxLength[j] - rows[i][j].length)
						line += rows[i][j] + padding
					} else if (align[j] == "right") {
						const pad = "​ "
						const padding = pad.repeat(maxLength[j] - rows[i][j].length)
						line += padding + rows[i][j]
					}
					line += surround(i)
				} else {
					line += rows[i][j]
				}
				if (j < rows[0].length - 1) line += spacer
			}
			output.push(line)
		}
		return output
	},

	/**
	 * @param {Discord.TextChannel|Discord.DMChannel} channel
	 * @param {string[]} title
	 * @param {string[][]} rows
	 */
	createPagination: function(channel, title, rows, align, maxLength) {
		let alignedRows = utils.tableifyRows([title].concat(rows), align, () => "`")
		const formattedTitle = alignedRows[0].replace(/`.+?`/g, sub => `__**\`${sub}\`**__`)
		alignedRows = alignedRows.slice(1)
		const pages = utils.createPages(alignedRows, maxLength - formattedTitle.length - 1, 16, 4)
		utils.paginate(channel, pages.length, page => {
			return utils.contentify(channel,
				new Discord.MessageEmbed()
					.setTitle("Viewing all playlists")
					.setColor(0x36393f)
					.setDescription(`${formattedTitle}\n${pages[page].join("\n")}`)
					.setFooter(`Page ${page + 1} of ${pages.length}`)
			)
		})
	},

	/**
	 * @param {Discord.TextChannel|Discord.DMChannel} channel
	 * @param {number} pageCount
	 * @param {(page: number) => any} callback
	 */
	paginate: async function(channel, pageCount, callback) {
		let page = 0
		const msg = await channel.send(callback(page))
		if (pageCount > 1) {
			let reactionMenuExpires
			const reactionMenu = utils.reactionMenu(msg, [
				{ emoji: "bn_ba:328062456905728002", remove: "user", actionType: "js", actionData: () => {
					page--
					if (page < 0) page = pageCount - 1
					msg.edit(callback(page))
					makeTimeout()
				} },
				{ emoji: "bn_fo:328724374465282049", remove: "user", actionType: "js", actionData: () => {
					page++
					if (page >= pageCount) page = 0
					msg.edit(callback(page))
					makeTimeout()
				} }
			])
			// eslint-disable-next-line no-inner-declarations
			function makeTimeout() {
				clearTimeout(reactionMenuExpires)
				reactionMenuExpires = setTimeout(() => {
					reactionMenu.destroy(true)
				}, 10 * 60 * 1000)
			}
			makeTimeout()
		}
	},

	/**
	 * @param {Discord.TextChannel|Discord.DMChannel} channel
	 * @param {string|Discord.MessageEmbed} content
	 */
	contentify: function(channel, content) {
		if (channel.type != "text") return content
		let value = ""
		let permissions
		if (channel instanceof Discord.TextChannel) permissions = channel.permissionsFor(client.user)
		if (content instanceof Discord.MessageEmbed) {
			if (permissions && !permissions.has("EMBED_LINKS")) {
				value = `${content.author ? `${content.author.name}\n` : ""}${content.title ? `${content.title}${content.url ? ` - ${content.url}` : ""}\n` : ""}${content.description ? `${content.description}\n` : ""}${content.fields.length > 0 ? content.fields.map(f => `${f.name}\n${f.value}`).join("\n") + "\n" : ""}${content.image ? `${content.image.url}\n` : ""}${content.footer ? content.footer.text : ""}`
				if (value.length > 2000) value = `${value.slice(0, 1960)}…`
				value += "\nPlease allow me to embed content"
			} else return content
		} else if (typeof (content) == "string") {
			value = content
			if (value.length > 2000) value = `${value.slice(0, 1998)}…`
		}
		return value.replace(/\[(.+?)\]\((https?:\/\/.+?)\)/gs, "$1: $2")
	},

	AsyncValueCache:
	/** @template T */
	class AsyncValueCache {
		/**
		 * @param {() => Promise<T>} getter
		 * @param {number} lifetime
		 */
		constructor(getter, lifetime = undefined) {
			this.getter = getter
			this.lifetime = lifetime
			this.lifetimeTimeout = null
			/** @type {Promise<T>} */
			this.promise = null
			/** @type {T} */
			this.cache = null
		}
		clear() {
			clearTimeout(this.lifetimeTimeout)
			this.cache = null
		}
		get() {
			if (this.cache) return Promise.resolve(this.cache)
			if (this.promise) return this.promise
			return this._getNew()
		}
		_getNew() {
			this.promise = this.getter()
			return this.promise.then(result => {
				this.cache = result
				this.promise = null
				clearTimeout(this.lifetimeTimeout)
				if (this.lifetime) this.lifetimeTimeout = setTimeout(() => this.clear(), this.lifetime)
				return result
			})
		}
	},

	FrequencyUpdater:
	class FrequencyUpdater {
		/**
		 * @param {() => any} callback
		 */
		constructor(callback) {
			this.callback = callback
			this.timeout = null
			this.interval = null
		}
		/**
		 * @param {number} frequency Number of milliseconds between calls of the callback
		 * @param {boolean} trigger Whether to call the callback straight away
		 * @param {number} delay Defaults to frequency. Delay to be used for the the first delay only.
		 */
		start(frequency, trigger, delay = frequency) {
			this.stop(false)
			if (trigger) this.callback()
			this.timeout = setTimeout(() => {
				this.callback()
				this.interval = setInterval(() => {
					this.callback()
				}, frequency)
			}, delay)
		}
		stop(trigger = false) {
			clearTimeout(this.timeout)
			clearInterval(this.interval)
			if (trigger) this.callback()
		}
	},

	/**
	 * @type {import("../typings").reactionMenu1 & (import("../typings").reactionMenu2) & (import("../typings").reactionMenu3) & (import("../typings").reactionMenu4)}
	 */
	reactionMenu: function(message, actions) {
		return new ReactionMenu(message, actions)
	},

	/**
	 * Get a random element from an array.
	 * @param {Array<T>} array
	 * @return {T}
	 * @template T
	 */
	arrayRandom: function(array) {
		const index = Math.floor(Math.random() * array.length)
		return array[index]
	},

	/**
	 * Shuffle an array in place.
	 * @param {Array<T>} array
	 * @return {Array<T>}
	 * @template T
	 */
	// thanks stackoverflow https://stackoverflow.com/a/12646864
	arrayShuffle: function(array) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]]
		}
		return array
	},

	shortTime:
	/**
	 * @param {number} number
	 * @param {"ms" | "sec"} scale
	 */
	function(number, scale, precision = ["d", "h", "m", "s"]) {
		if (isNaN(number)) throw new TypeError("Input provided is NaN")
		if (!scale) throw new RangeError("Missing scale")
		if (scale.toLowerCase() == "ms") number = Math.floor(number)
		else if (scale.toLowerCase() == "sec") number = Math.floor(number * 1000)
		else throw new TypeError("Invalid scale provided")
		const days = Math.floor(number / 1000 / 60 / 60 / 24)
		number -= days * 1000 * 60 * 60 * 24
		const hours = Math.floor(number / 1000 / 60 / 60)
		number -= hours * 1000 * 60 * 60
		const mins = Math.floor(number / 1000 / 60)
		number -= mins * 1000 * 60
		const secs = Math.floor(number / 1000)
		let timestr = ""
		if (days > 0 && precision.includes("d")) timestr += `${days}d `
		if (hours > 0 && precision.includes("h")) timestr += `${hours}h `
		if (mins > 0 && precision.includes("m")) timestr += `${mins}m `
		if (secs > 0 && precision.includes("s")) timestr += `${secs}s`
		if (!timestr) timestr = "0" + precision.slice(-1)[0]
		return timestr
	},

	emojiURL:
	/**
	 * @param {string} id
	 * @param {boolean} [animated]
	 */
	function(id, animated = false) {
		const ext = animated ? "gif" : "png"
		return `https://cdn.discordapp.com/emojis/${id}.${ext}`
	},

	findUser:
	/**
	 * @param {Discord.Message} message Message Object
	 * @param {string} string String to search users by
	 * @param {boolean} [self=false] If the function should return the `message` author's user Object
	 * @returns {Promise<Discord.User>}
	 */
	function(message, string, self = false) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async resolve => {
			let permissions
			if (message.channel instanceof Discord.TextChannel) permissions = message.channel.permissionsFor(client.user)
			string = string.toLowerCase()
			if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1]
			/** @type {Array<(user: Discord.User) => boolean>} */
			let matchFunctions = []
			matchFunctions = matchFunctions.concat([
				user => user.id == string,
				user => user.tag.toLowerCase() == string,
				user => user.username.toLowerCase() == string,
				user => user.username.toLowerCase().includes(string)
			])
			if (!string) {
				if (self) return resolve(message.author)
				else return resolve(null)
			} else {
				if (client.users.cache.get(string)) return resolve(client.users.cache.get(string))
				const list = []
				matchFunctions.forEach(i => client.users.cache.filter(u => i(u))
					.forEach(us => {
						if (!list.includes(us) && list.length < 10) list.push(us)
					}))
				if (list.length == 1) return resolve(list[0])
				if (list.length == 0) return resolve(null)
				const embed = new Discord.MessageEmbed().setTitle("User selection").setDescription(list.map((item, i) => `${i + 1}. ${item.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E")
				const selectmessage = await message.channel.send(utils.contentify(message.channel, embed))
				const collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), { max: 1, time: 60000 })
				// eslint-disable-next-line no-return-await
				return await collector.next.then(newmessage => {
					const index = Number(newmessage.content)
					if (!index || !list[index - 1]) return resolve(null)
					selectmessage.delete()
					// eslint-disable-next-line no-empty-function
					if (message.channel.type != "dm") newmessage.delete().catch(() => {})
					return resolve(list[index - 1])
				}).catch(() => {
					embed.setTitle("User selection cancelled").setDescription("").setFooter("")
					selectmessage.edit(utils.contentify(selectmessage.channel, embed))
					return resolve(null)
				})
			}
		})
	},

	/**
	 * Do not ask me in what way this "fixes" an emoji.
	 * Please know what you are doing before touching this.
	 * This should probably only be used in the reaction event.
	 */
	fixEmoji: function(emoji) {
		if (emoji && emoji.name) {
			if (emoji.id != null) return `${emoji.name}:${emoji.id}`
			else return emoji.name
		}
		return emoji
	},

	/**
	 * @param {string} channelID
	 * @param {string} messageID
	 * @param {emoji} any
	 * @param {string} [userID]
	 */
	removeUncachedReaction: function(channelID, messageID, emoji, userID) {
		if (!userID) userID = "@me"
		let reaction
		if (emoji.id) {
			// Custom emoji, has name and ID
			reaction = `${emoji.name}:${emoji.id}`
		} else {
			// Default emoji, has name only
			reaction = encodeURIComponent(emoji.name)
		}
		// @ts-ignore: client.api is not documented
		const promise = client.api.channels(channelID).messages(messageID).reactions(reaction, userID).delete()
		promise.catch(() => console.error)
		return promise
	},

	getFirstShard: function() {
		if (client.shard) return client.shard.ids[0]
		else return 0
	},

	getShardsArray: function() {
		if (client.shard) return client.shard.ids
		else return [0]
	},

	getFirstShardForMachine: function() {
		if (config.shard_list) return config.shard_list[0]
		else return 0
	},

	isFirstShardOnMachine: function() {
		return utils.getFirstShard() === utils.getFirstShardForMachine()
	},

	/**
	 * A function to replace wildcard (%string) strings with information from lang
	 * @param {string} string The string from lang
	 * @param {Object.<string, any>} properties example: `{ "username": "PapiOphidian" }`
	 * @returns {string}
	 */
	replace: function(string, properties = {}) {
		let value = string.slice(0, string.length)
		Object.keys(properties).forEach(item => {
			const index = value.indexOf(`%${item}`)
			if (index != -1) value = value.slice(0, index) + properties[item] + value.slice(index + item.length + 1)
		})
		return value
	},

	getStats: function() {
		const ram = process.memoryUsage()
		return {
			ping: client.ws.ping,
			uptime: process.uptime(),
			ram: ram.rss - (ram.heapTotal - ram.heapUsed),
			users: client.users.cache.size,
			guilds: client.guilds.cache.size,
			channels: client.channels.cache.size,
			connections: client.lavalink.players.size
		}
	},

	/**
	 * @param {string} id
	 * @param {"self"|"guild"} type
	 * @returns {Promise<Lang.Lang>}
	 */
	getLang: async function(id, type) {
		let code, row
		if (type === "self") {
			row = await utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID = ? AND setting = ?", [id, "language"])
		} else if (type === "guild") {
			row = await utils.sql.get("SELECT * FROM SettingsGuild WHERE keyID = ? AND setting = ?", [id, "language"])
		}
		if (row) {
			code = row.value
		} else {
			code = "en-us"
		}

		const value = Lang[code.replace("-", "_")] || Lang.en_us
		return value
	},
	findChannel:
	/**
	 * Find a channel in a guild
	 * @param {Discord.Message} message Message Object
	 * @param {string} string String to search channels by
	 * @param {boolean} [self=false] If the function should return `message`.channel
	 * @returns {Promise<Discord.TextChannel | Discord.VoiceChannel>}
	 */
	function(message, string, self) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async resolve => {
			if (message.channel instanceof Discord.DMChannel) return resolve(null)
			const permissions = message.channel.permissionsFor(client.user)
			string = string.toLowerCase()
			if (/<#(\d+)>/.exec(string)) string = /<#(\d+)>/.exec(string)[1]
			/** @type {Array<(channel: Discord.TextChannel | Discord.VoiceChannel) => boolean>} */
			let matchFunctions = []
			matchFunctions = matchFunctions.concat([
				channel => channel.id == string,
				channel => channel.name.toLowerCase() == string,
				channel => channel.name.toLowerCase().includes(string)
			])
			if (!string) {
				// @ts-ignore
				if (self) resolve(message.channel)
				else resolve(null)
			} else {
				// @ts-ignore
				if (message.guild.channels.get(string)) return resolve(message.guild.channels.get(string))
				/** @type {Array<Discord.TextChannel | Discord.VoiceChannel>} */
				const list = []
				const channels = message.guild.channels.cache.filter(c => c.type == "text" || c.type == "voice")
				matchFunctions.forEach(i => channels
					// @ts-ignore
					.filter(c => i(c))
					.forEach(ch => {
						// @ts-ignore
						if (!list.includes(ch) && list.length < 10) list.push(ch)
					}))
				if (list.length == 1) return resolve(list[0])
				if (list.length == 0) return resolve(null)
				const embed = new Discord.MessageEmbed().setTitle("Channel selection").setDescription(list.map((item, i) => `${item.type == "voice" ? "<:voice:674569797278760961>" : "<:text:674569797278892032>"} ${i + 1}. ${item.name}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E")
				const selectmessage = await message.channel.send(utils.contentify(message.channel, embed))
				const collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), { max: 1, time: 60000 })
				// eslint-disable-next-line no-return-await
				return await collector.next.then(newmessage => {
					const index = Number(newmessage.content)
					if (!index || !list[index - 1]) return resolve(null)
					selectmessage.delete()
					// eslint-disable-next-line no-empty-function
					newmessage.delete().catch(() => {})
					return resolve(list[index - 1])
				}).catch(() => {
					embed.setTitle("Channel selection cancelled").setDescription("").setFooter("")
					selectmessage.edit(utils.contentify(selectmessage.channel, embed))
					return resolve(null)
				})
			}
		})
	},

	/**
	 * discord.js is hilarious(ly awful)
	 * @param {string} channelID
	 * @param {boolean} useBlacklist refuse to send more messages to channels with missing access
	 * @param {Discord.MessageOptions|Discord.MessageAdditions} content
	 */
	sendToUncachedChannel: function(channelID, useBlacklist, content) {
		if (useBlacklist) {
			if (uncachedChannelSendBlacklist.has(channelID)) return Promise.reject(new Error("Channel is blacklisted because you did not have permission last time."))
		} else {
			uncachedChannelSendBlacklist.delete(channelID)
		}
		// @ts-ignore holy shit, remove this and see what happens. it's so so cursed
		return client.api.channels[channelID].messages.post(
			Discord.APIMessage.create(
				// @ts-ignore xd
				{ id: channelID, client: client },
				content
			).resolveData()
		).catch(error => {
			if (error && error.name === "DiscordAPIError" && error.code === 50001) { // missing access
				uncachedChannelSendBlacklist.add(channelID)
			}
			throw error
		})
	},

	/**
	 * @param {Discord.Message} msg
	 */
	resolveWebhookMessageAuthor: async function(msg) {
		const row = await utils.sql.get(
			"SELECT userID, user_username, user_discriminator FROM WebhookAliases"
				+ " WHERE webhookID = ? AND webhook_username = ?",
			[msg.webhookID, msg.author.username]
		)
		if (!row) return null
		/** @type {Discord.User} */
		let newAuthor
		let newUserData
		if (client.users.cache.has(row.userID)) {
			newAuthor = client.users.cache.get(row.userID)
		} else {
			await client.users.fetch(row.userID).then(m => {
				newAuthor = m
			}).catch(() => {
				newUserData = {
					id: row.userID,
					bot: false,
					username: row.user_username,
					discriminator: row.user_discriminator,
					avatar: null
				}
				newAuthor = new Discord.User(client, newUserData)
			})
		}
		msg.author = newAuthor
		/** @type {Discord.GuildMember} */
		if (!msg.guild.members.cache.has(row.userID)) {
			await msg.guild.members.fetch(row.userID).catch(() => {
				msg.guild.members.add(newUserData)
			})
		}
		return msg
	},

	editLavalinkNodes: {
		/**
		 * @returns {[number, number]} removedCount, addedCount
		 */
		applyChanges: function() {
			let removedCount = 0
			let addedCount = 0
			for (const node of client.lavalink.nodes.values()) {
				if (!constants.lavalinkNodes.find(n => n.host === node.host)) {
					removedCount++
					const nodeInstance = client.lavalink.nodes.get(node.host)
					client.lavalink.removeNode(node.host)
					nodeInstance.destroy()
				}
			}

			for (const node of constants.lavalinkNodes) {
				if (!client.lavalink.nodes.has(node.host)) {
					addedCount++
					client.lavalink.createNode(node)
				}
			}
			return [removedCount, addedCount]
		},

		/**
		 * @param {string} name
		 */
		removeByName: function(name) {
			constants.lavalinkNodes = constants.lavalinkNodes.filter(node => node.name !== name)
			return utils.editLavalinkNodes.applyChanges()
		},

		add: function(data) {
			constants.lavalinkNodes.push(data)
			return utils.editLavalinkNodes.applyChanges()
		},

		/**
		 * Add enabled and disconnected nodes to the client node list and connect to them.
		 * Clean unused and disabled client nodes and close their websockets
		 * so that the lavalink process can be ended safely.
		 *
		 * @returns {[number, number]} cleaned nodes, added nodes
		 */
		syncConnections: function() {
			const queues = passthrough.queues // file load order means queueStore cannot be extracted at top of file

			let cleanedCount = 0
			let addedCount = 0

			for (const node of constants.lavalinkNodes) { // loop through all known nodes
				const clientNode = client.lavalink.nodes.find(n => n.host === node.host) // get the matching client node
				if (node.enabled) { // try connecting to nodes
					if (clientNode) continue // only consider situations where the client node is unknown
					// connect to the node
					client.lavalink.createNode(node)
					addedCount++
				} else { // try disconnecting from nodes
					if (!clientNode) continue // only consider situations where the client node is known
					// if no queues are using the node, disconnect it.
					if (!queues.cache.some(q => q.player.node === clientNode)) {
						client.lavalink.removeNode(clientNode.host)
						clientNode.destroy()
						cleanedCount++
					}
				}
			}

			return [cleanedCount, addedCount]
		}
	},

	timeUntilSongsEnd: function() {
		const queueStore = passthrough.queues // file load order means queueStore cannot be extracted at top of file
		let max = 0
		for (const queue of queueStore.cache.values()) {
			if (queue.songs[0] && queue.songs[0].lengthSeconds >= 0) {
				if (queue.songs[0].lengthSeconds > max) max = queue.songs[0].lengthSeconds
			}
		}
		return max
	},

	timeUntilQueuesEnd: function() {
		const queueStore = passthrough.queues // file load order means queueStore cannot be extracted at top of file
		let max = 0
		for (const queue of queueStore.cache.values()) {
			let total = 0
			for (const song of queue.songs) {
				if (song.lengthSeconds >= 0) total += song.lengthSeconds
			}
			if (total > max) max = total
		}
		return max
	}
}

utils.addTemporaryListener(reloadEvent, "@amanda/lang", path.basename(__filename), () => {
	Lang = require("@amanda/lang")
})

module.exports = utils
