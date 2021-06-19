// @ts-check

const passthrough = require("../../passthrough")
const { sync, client } = passthrough

/**
 * @type {import("./orm")}
 */
const orm = sync.require("./orm")
const db = orm.db

const startingCoins = 5000

/**
 * @param {string} userID
 * @returns {Promise<bigint>}
 */
async function get(userID) {
	const row = await getPersonalRow(userID)
	return BigInt(row.amount)
}

/**
 * @param {string} userID
 * @returns {Promise<{ id: string, amount: string }>}
 */
async function getPersonalRow(userID) {
	const row = await db.raw("SELECT bank_accounts.id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id WHERE bank_access.user_id = $1 AND bank_accounts.type = 0", [userID])
	if (row && Array.isArray(row) && row[0]) return row[0]
	else {
		const newRow = await db.raw("INSERT INTO bank_accounts (amount) VALUES ($1) RETURNING id", [startingCoins]) // default type is 0 which is personal acc. No need to specify
		if (!newRow || Array.isArray(newRow) && !newRow[0]) throw new Error("NO_CREATE_BANK_ACCOUNT_ID")
		const accID = newRow[0].id
		await db.insert("bank_access", { id: accID, user_id: userID })
		return { id: accID, amount: String(startingCoins) }
	}
}

/**
 * @param {string} userID
 */
async function getCoupleRow(userID) {
	const row = await db.raw("SELECT bank_accounts.id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id WHERE bank_access.user_id = $1 AND bank_accounts.type = 1", [userID])
	if (!row || Array.isArray(row) && !row[0]) return null
	/** @type {{ id: string, amount: string }} */
	const bank = row[0]
	const inCoupleBank = await db.select("bank_access", { id: bank.id }, { select: ["user_id"] }).then(rs => rs.map(r => r.user_id))
	return { id: bank.id, amount: bank.amount, users: inCoupleBank }
}

/**
 * @param {string} userID
 * @param {bigint} value
 * @param {string} reason
 */
async function award(userID, value, reason) {
	const row = await getPersonalRow(userID)
	await Promise.all([
		db.update("bank_accounts", { amount: (BigInt(row.amount) + value).toString() }, { id: row.id }),
		db.insert("transactions", { user_id: client.user.id, amount: (value < BigInt(0) ? (value * BigInt(-1)) : value).toString(), mode: value < BigInt(0) ? 1 : 0, description: reason, target: row.id })
	])
}

/**
 * @param {string} from
 * @param {string} to
 * @param {bigint} amount
 */
async function transact(from, to, amount) {
	const fromRow = await getPersonalRow(from)
	const toRow = await getPersonalRow(to)

	await Promise.all([
		db.update("bank_accounts", { amount: (BigInt(toRow.amount) + amount).toString() }, { id: toRow.id }),
		db.update("bank_accounts", { amount: (BigInt(fromRow.amount) - amount).toString() }, { id: fromRow.id }),
		db.insert("transactions", { user_id: from, amount: amount.toString(), mode: 0, description: `transfer to ${to}`, target: toRow.id }), // Mode 0 is send. 1 is receive.
		db.insert("transactions", { user_id: to, amount: amount.toString(), mode: 1, description: `transfer from ${from}`, target: fromRow.id })
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
module.exports.getPersonalRow = getPersonalRow
module.exports.getCoupleRow = getCoupleRow
module.exports.award = award
module.exports.transact = transact
module.exports.updateCooldown = updateCooldown
