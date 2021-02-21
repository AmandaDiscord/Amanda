// @ts-check

const sql = require("./sql")

const startingCoins = 5000

/**
 * @param {string} userID
 * @param {number} [extra=0]
 */
function create(userID, extra = 0) {
	return sql.all("INSERT INTO money (user_id, coins) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET coins = $2", [userID, startingCoins + extra]).then(() => startingCoins + extra)
}

/**
 * @param {string} userID
 * @returns {Promise<number>}
 */
async function get(userID) {
	const row = await sql.get("SELECT * FROM money WHERE user_id = $1", userID)
	if (row) return row.coins
	else return create(userID)
}

/**
 * @param {string} userID
 * @param {string} [fields="*"]
 * @returns {Promise<{ user_id: string, coins: number, won_coins: number, lost_coins: number, given_coins: number }>}
 */
async function getRow(userID, fields = "*") {
	const statement = `SELECT ${fields} FROM money WHERE user_id = $1`
	const row = await sql.get(statement, userID)
	if (row) return row
	else {
		await create(userID)
		return sql.get(statement, userID)
	}
}

/**
 * @param {string} userID
 * @param {number} value
 */
async function set(userID, value) {
	const row = await sql.get("SELECT * FROM money WHERE user_id = $1", userID)
	if (row) sql.all("UPDATE money SET coins = $1 WHERE user_id = $2", [value, userID])
	else await sql.all("INSERT INTO money (user_id, coins) VALUES ($1, $2)", [userID, value])
}

/**
 * @param {string} userID
 * @param {number} value
 */
async function award(userID, value) {
	const row = await sql.get("SELECT * FROM money WHERE user_id = $1", userID)
	if (row) {
		const earned = value > 0
		const coinfield = earned ? "won_coins" : "lost_coins"
		await sql.all(`UPDATE money SET coins = $1, ${coinfield} = ${coinfield} + $2 WHERE user_id = $3`, [row.coins + value, earned ? value : (value * -1), userID])
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
		sql.all("UPDATE money SET coins = $1 WHERE user_id = $2", [u2coins + amount, user2]),
		sql.all("UPDATE money SET coins = $1, given_coins = $2 WHERE user_id = $3", [u1row.coins - amount, u1row.given_coins + amount, user1])
	])
}

/**
 * @param {string} userID
 * @param {string} command
 * @param {{ max: number, min: number, step: number, regen: { time: number, amount: number }}} info
 */
async function updateCooldown(userID, command, info) {
	let winChance = info.max
	const cooldown = await sql.get("SELECT * FROM money_cooldown WHERE user_id = $1 AND command = $2", [userID, command])
	if (cooldown) {
		winChance = Math.max(info.min, Math.min(info.max, cooldown.value + Math.floor((Date.now() - cooldown.date) / info.regen.time) * info.regen.amount))
		const newValue = winChance - info.step
		sql.all("UPDATE money_cooldown SET date = $1, value = $2 WHERE user_id = $3 AND command = $4", [Date.now(), newValue, userID, command])
	} else sql.all("INSERT INTO money_cooldown (user_id, command, date, value) VALUES ($1, $2, $3, $4)", [userID, command, Date.now(), info.max - info.step])
	return winChance
}

module.exports.get = get
module.exports.getRow = getRow
module.exports.set = set
module.exports.award = award
module.exports.transact = transact
module.exports.updateCooldown = updateCooldown
