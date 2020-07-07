// @ts-check

const sql = require("./sql")

const startingCoins = 5000

/**
 * @param {string} userID
 * @param {number} [extra=0]
 */
function create(userID, extra = 0) {
	return sql.all("REPLACE INTO money(userID, coins) VALUES (?, ?)", [userID, startingCoins + extra]).then(() => startingCoins + extra)
}

/**
 * @param {string} userID
 * @returns {Promise<number>}
 */
async function get(userID) {
	const row = await sql.get("SELECT * FROM money WHERE userID = ?", userID)
	if (row) return row.coins
	else return create(userID)
}

/**
 * @param {string} userID
 * @param {string} [fields="*"]
 * @returns {Promise<{ userID: string, coins: number, woncoins: number, lostcoins: number, givencoins: number }>}
 */
async function getRow(userID, fields = "*") {
	const statement = `SELECT ${fields} FROM money WHERE userID =?`
	const row = await sql.get(statement, userID)
	// @ts-ignore
	if (row) return row
	else {
		await create(userID)
		// @ts-ignore
		return sql.get(statement, userID)
	}
}

/**
 * @param {string} userID
 * @param {number} value
 */
async function set(userID, value) {
	const row = await sql.get("SELECT * FROM money WHERE userID = ?", userID)
	if (row) sql.all("UPDATE money SET coins = ? WHERE userID = ?", [value, userID])
	else await sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [userID, value])
}

/**
 * @param {string} userID
 * @param {number} value
 */
async function award(userID, value) {
	const row = await sql.get("SELECT * FROM money WHERE userID = ?", userID)
	if (row) {
		const earned = value > 0
		const coinfield = earned ? "woncoins" : "lostcoins"
		await sql.all(`UPDATE money SET coins = ?, ${coinfield} = ${coinfield} + ? WHERE userID = ?`, [row.coins + value, earned ? value : (value * -1), userID])
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
		sql.all("UPDATE money SET coins =? WHERE userID =?", [u2coins + amount, user2]),
		sql.all("UPDATE money SET coins =?, givencoins =? WHERE userID =?", [u1row.coins - amount, u1row.givencoins + amount, user1])
	])
}

/**
 * @param {string} userID
 * @param {string} command
 * @param {{ max: number, min: number, step: number, regen: { time: number, amount: number }}} info
 */
async function updateCooldown(userID, command, info) {
	let winChance = info.max
	const cooldown = await sql.get("SELECT * FROM MoneyCooldown WHERE userID = ? AND command = ?", [userID, command])
	if (cooldown) {
		winChance = Math.max(info.min, Math.min(info.max, cooldown.value + Math.floor((Date.now() - cooldown.date) / info.regen.time) * info.regen.amount))
		const newValue = winChance - info.step
		sql.all("UPDATE MoneyCooldown SET date = ?, value = ? WHERE userID = ? AND command = ?", [Date.now(), newValue, userID, command])
	} else sql.all("INSERT INTO MoneyCooldown VALUES (NULL, ?, ?, ?, ?)", [userID, command, Date.now(), info.max - info.step])
	return winChance
}

module.exports.get = get
module.exports.getRow = getRow
module.exports.set = set
module.exports.award = award
module.exports.transact = transact
module.exports.updateCooldown = updateCooldown
