// @ts-check

const passthrough = require("../../passthrough")
const { sync } = passthrough

/**
 * @type {import("./orm")}
 */
const orm = sync.require("./orm")
const db = orm.db

const startingCoins = 5000

/**
 * @param {string} userID
 * @param {number} [extra=0]
 */
async function create(userID, extra = 0) {
	await db.upsert("money", { user_id: userID, coins: startingCoins + extra })
	return startingCoins + extra
}

/**
 * @param {string} userID
 * @returns {Promise<number>}
 */
async function get(userID) {
	const row = await db.get("money", { user_id: userID })
	if (row) return Number(row.coins)
	else return create(userID)
}

/**
 * @param {string} userID
 */
async function getRow(userID) {
	const row = await db.get("money", { user_id: userID })
	if (row) return { user_id: row.user_id, coins: Number(row.coins), won_coins: Number(row.coins), lost_coins: Number(row.lost_coins), given_coins: Number(row.given_coins) }
	else {
		await create(userID)
		return { user_id: userID, coins: startingCoins, won_coins: 0, lost_coins: 0, given_coins: 0 }
	}
}

/**
 * @param {string} userID
 * @param {number} value
 */
async function set(userID, value) {
	const row = await db.get("money", { user_id: userID })
	if (row) await db.update("money", { coins: value }, { user_id: userID })
	else db.insert("money", { user_id: userID, coins: value })
}

/**
 * @param {string} userID
 * @param {number} value
 */
async function award(userID, value) {
	const row = await getRow(userID)
	if (row) {
		const earned = value > 0
		const coinfield = earned ? "won_coins" : "lost_coins"
		await db.raw(`UPDATE money SET coins = $1, ${coinfield} = ${coinfield} + $2 WHERE user_id = $3`, [row.coins + value, earned ? value : (value * -1), userID])
	} else {
		await create(userID, value)
	}
}

/**
 * @param {string} user1
 * @param {string} user2
 * @param {number} amount
 */
async function transact(user1, user2, amount) {
	const u1row = await getRow(user1)
	const u2coins = await get(user2)

	await Promise.all([
		db.update("money", { coins: u2coins + amount }, { user_id: user2 }),
		db.update("money", { coins: u1row.coins - amount, given_coins: u1row.given_coins + amount }, { user_id: user1 })
	])
}

/**
 * @param {string} userID
 * @param {string} command
 * @param {{ max: number, min: number, step: number, regen: { time: number, amount: number }}} info
 */
async function updateCooldown(userID, command, info) {
	let winChance = info.max
	const uidcmdpl = { user_id: userID, command: command }
	const cooldown = await db.get("money_cooldown", uidcmdpl)
	if (cooldown) {
		winChance = Math.max(info.min, Math.min(info.max, Number(cooldown.value) + Math.floor((Date.now() - Number(cooldown.date)) / info.regen.time) * info.regen.amount))
		const newValue = winChance - info.step
		db.update("money_cooldown", { date: Date.now(), value: newValue }, uidcmdpl)
	} else db.insert("money_cooldown", { user_id: userID, command: command, date: Date.now(), value: info.max - info.step })
	return winChance
}

module.exports.get = get
module.exports.getRow = getRow
module.exports.set = set
module.exports.award = award
module.exports.transact = transact
module.exports.updateCooldown = updateCooldown
