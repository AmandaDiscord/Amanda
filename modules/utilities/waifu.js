// @ts-check

const passthrough = require("../../passthrough")
const { client } = passthrough

const sql = require("./sql")
const coinsManager = require("./coinsmanager")
const { cacheManager } = require("./cachemanager")

const waifuGifts = {
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
}

/**
 * @param {string} userID
 * @param {{basic: boolean}} [options]
 * @returns {Promise<{claimer: import("thunderstorm").User, price: number, waifu: import("thunderstorm").User, waifuID?: string, userID?: string, waifuPrice: number, gifts: {received: {list: Array<any>, emojis: string}, sent: {list: Array<any>, emojis: string}}}>}
 */
async function get(userID, options) {
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
				const info = await sql.get("SELECT * FROM waifu WHERE userID =?", userID)
				// @ts-ignore
				return info
			}
		}
	}
	const [meRow, claimerRow, receivedGifts, sentGifts] = await Promise.all([
		sql.get("SELECT waifuID, price FROM waifu WHERE userID = ?", userID),
		sql.get("SELECT userID, price FROM waifu WHERE waifuID = ?", userID),
		sql.all("SELECT senderID, type FROM WaifuGifts WHERE receiverID = ?", userID),
		sql.all("SELECT receiverID, type FROM WaifuGifts WHERE senderID = ?", userID)
	])
	const claimer = claimerRow ? await cacheManager.users.get(claimerRow.userID, true) : undefined
	const price = claimerRow ? Math.floor(claimerRow.price * 1.25) : 0
	const waifu = meRow ? await cacheManager.users.get(meRow.waifuID, true) : undefined
	const waifuPrice = meRow ? Math.floor(meRow.price * 1.25) : 0
	const gifts = {
		received: {
			list: receivedGifts.map(g => g.type),
			emojis: receivedGifts.map(g => waifuGifts[g.type].emoji).join("").replace(/(.{10})/g, "$1\n").trim()
		},
		sent: {
			list: sentGifts.map(g => g.type),
			emojis: sentGifts.map(g => waifuGifts[g.type].emoji).join("").replace(/(.{10})/g, "$1\n").trim()
		}
	}
	// @ts-ignore
	return { claimer, price, waifu, waifuPrice, gifts }
}


/**
 * @param {string} claimer
 * @param {string} claimed
 * @param {number} price
 */
async function bind(claimer, claimed, price) {
	await Promise.all([
		sql.all("DELETE FROM waifu WHERE userID = ? OR waifuID = ?", [claimer, claimed]),
		coinsManager.award(claimer, -price)
	])
	void await sql.all("INSERT INTO waifu VALUES (?, ?, ?)", [claimer, claimed, price])
}

/**
 * @param {string} user
 */
async function unbind(user) {
	void await sql.all("DELETE FROM waifu WHERE userID = ?", [user])
}

/**
 * @param {string} user
 * @param {number} amount
 */
async function transact(user, amount) {
	const waifu = await this.get(user, { basic: true })
	void await sql.all("UPDATE waifu SET price =? WHERE userID =?", [waifu.price + amount, user])
}

module.exports.get = get
module.exports.bind = bind
module.exports.unbind = unbind
module.exports.transact = transact
