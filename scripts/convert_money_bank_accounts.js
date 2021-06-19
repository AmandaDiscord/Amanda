const util = require("util")
const Postgres = require("pg")
const Sync = require("heatsync")
const sync = new Sync()

const config = require("../config.js")

const passthrough = require("../passthrough")

const pool = new Postgres.Pool({
	host: config.sql_domain,
	user: "amanda",
	password: config.sql_password,
	database: "main",
	max: 2
})

;(async () => {
	const pgpool = await pool.connect()

	passthrough.db = pgpool
	passthrough.sync = sync
	const orm = require("../modules/utilities/orm")
	const sql = require("../modules/utilities/sql")

	const money = await orm.db.select("money")

	for (const row of money) {
		const updated = await sql.get("INSERT INTO bank_accounts (amount, type) VALUES ($1, $2) RETURNING id", [row.coins, 0])
		if (!updated || !updated.id) throw new Error("CONVERT_NO_NEW_MONEY_ID")
		await orm.db.insert("bank_access", { id: updated.id, user_id: row.user_id })
		console.log(`Done with money row for ${row.user_id}`)
	}

	console.log("Done with money table\n\n")

	const couples = await orm.db.select("couples")

	for (const couple of couples) {
		const updated = await sql.get("INSERT INTO bank_accounts (amount, type) VALUES ($1, $2) RETURNING id", [couple.balance, 1])
		if (!updated || !updated.id) throw new Error("CONVERT_NO_NEW_COUPLE_ID")
		await sql.all("INSERT INTO bank_access (id, user_id) VALUES ($1, $2), ($1, $3)", [updated.id, couple.user1, couple.user2])
		console.log(`Done with couple row for ${couple.user1} & ${couple.user2}`)
	}
})()
