const mysql = require("mysql2/promise")

const config = require("../config.js")

const db = mysql.createPool({
	host: config.mysql_domain,
	user: "amanda",
	password: config.mysql_password,
	database: "money",
	connectionLimit: 5
})

;(async () => {
	await Promise.all([
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	])

	/**
	 * @param {string} statement
	 * @param {Array<any>} params
	 * @returns {Promise<Array<any>>}
	 */
	function sql_all(statement, params) {
		return db.execute(statement, params).then(result => result[0])
	}

	const rows = await sql_all("SELECT * FROM waifu")
	const processed = []
	for (const row of rows) {
		if (processed.includes(row.userID) || processed.includes(row.waifuID)) continue

		const waifuRow = rows.find(r => r.userID === row.waifuID)
		if (waifuRow && !(waifuRow.waifuID === row.userID)) continue

		const value = row.price ? (row.price + (waifuRow && waifuRow.price ? waifuRow.price : 0)) : 0
		await sql_all("INSERT INTO Couples (user1, user2, balance) VALUES (?, ?, ?)", [row.userID, row.waifuID, value])
		processed.push(row.userID)
		processed.push(row.waifuID)
		console.log(`Processed row for ${row.userID} & ${row.waifuID} :: ${value}`)
	}
})()
