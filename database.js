const fs = require("fs");

module.exports = function(password) {
	const mysql = require("mysql2/promise");
	let pool = mysql.createPool({
		host: "cadence.gq",
		user: "amanda",
		password: password,
		database: "money",
		connectionLimit: 5
	});
	pool.query("SELECT 1").then(() => {
		console.log("Connected to MySQL database");
	}).catch(err => {
		console.log("Failed to connect to database\n", err);
	});
	return pool;
}