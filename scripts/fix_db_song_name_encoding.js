const config = require("../config.js")

const mysql = require("mysql2/promise")
const YouTube = require("simple-youtube-api")

let db = mysql.createPool({
	host: config.mysql_domain,
	user: "amanda",
	password: config.sql_password,
	database: "money",
	connectionLimit: 5
})
const youtube = new YouTube(config.yt_api_key)

;(async () => {
	await Promise.all([
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	])

	function sql_all(statement, params) {
		return db.execute(statement, params).then(result => result[0])
	}

	let rows = await sql_all("select * from Songs where name like ?", ["%?%"])

	for (let row of rows) {
		let video = await youtube.getVideoByID(row.videoID)
		console.log(`${row.name} → ${video.title}`)
		await sql_all("update Songs set name = ? where videoID = ?", [video.title, row.videoID])
	}
})()
