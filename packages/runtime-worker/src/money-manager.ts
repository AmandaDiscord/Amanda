import passthrough = require("./passthrough")
const { client, sql } = passthrough

export const startingCoins = 5000

export async function getPersonalRow(userID: string) {
	const row = await sql.get<{ id: string, amount: string }>(
		"SELECT bank_accounts.id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id WHERE bank_access.user_id = $1 AND bank_accounts.type = 0",
		[userID]
	)

	if (row) return row
	else {
		const newRow = await sql.get<{ id: string }>(
			"INSERT INTO bank_accounts (amount) VALUES ($1) RETURNING id",
			[startingCoins]
		) // default type is 0 which is personal acc. No need to specify

		if (!newRow) throw new Error("NO_CREATE_BANK_ACCOUNT_ID")

		await sql.orm.insert("bank_access", { id: newRow.id, user_id: userID })

		return { id: newRow.id, amount: String(startingCoins) }
	}
}

export async function getCoupleRow(userID: string) {
	const row = await sql.get<{ id: string, amount: string }>(
		"SELECT bank_accounts.id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id WHERE bank_access.user_id = $1 AND bank_accounts.type = 1",
		[userID]
	)

	if (!row) return null

	const inCoupleBank = await sql.orm.select("bank_access", { id: row.id }, { select: ["user_id"] })
		.then(rs => rs.map(r => r.user_id))

	return { id: row.id, amount: row.amount, users: inCoupleBank }
}

export async function awardAmount(userID: string, value: bigint, reason: string): Promise<void> {
	const row = await getPersonalRow(userID)
	await Promise.all([
		sql.orm.update("bank_accounts", {
			amount: (BigInt(row.amount) + value).toString()
		}, { id: row.id }),
		sql.orm.insert("transactions", {
			user_id: client.user.id,
			amount: (value < BigInt(0) ? (value * BigInt(-1)) : value).toString(),
			mode: value < BigInt(0) ? 1 : 0,
			description: reason,
			target: row.id
		})
	])
}

export async function transact(from: string, to: string, amount: bigint): Promise<void> {
	const fromRow = await getPersonalRow(from)
	const toRow = await getPersonalRow(to)

	await Promise.all([
		sql.orm.update("bank_accounts", {
			amount: (BigInt(toRow.amount) + amount).toString()
		}, { id: toRow.id }),
		sql.orm.update("bank_accounts", {
			amount: (BigInt(fromRow.amount) - amount).toString()
		}, { id: fromRow.id }),
		sql.orm.insert("transactions", {
			user_id: from,
			amount: amount.toString(),
			mode: 0,
			description: `transfer to ${to}`,
			target: toRow.id
		}), // Mode 0 is send. 1 is receive.
		sql.orm.insert("transactions", {
			user_id: to,
			amount: amount.toString(),
			mode: 1,
			description: `transfer from ${from}`,
			target: fromRow.id
		})
	])
}

export type CooldownInfo = { max: number, min: number, step: number, regen: { amount: number, time: number, } }

export async function updateCooldown(userID: string, command: string, info: CooldownInfo): Promise<number> {
	let winChance = info.max
	const uidcmdpl = { user_id: userID, command: command }
	const cooldown = await sql.orm.get("money_cooldown", uidcmdpl)

	if (cooldown) {
		winChance = Math.max(
			info.min,
			Math.min(
				info.max,
				Number(cooldown.value) + Math.floor((Date.now() - Number(cooldown.date)) / info.regen.time) * info.regen.amount
			)
		)

		const newValue = winChance - info.step

		sql.orm.update("money_cooldown", {
			date: Date.now(),
			value: newValue
		}, uidcmdpl)
	} else {
		sql.orm.insert("money_cooldown", {
			user_id: userID,
			command: command,
			date: Date.now(),
			value: info.max - info.step
		})
	}
	return winChance
}
