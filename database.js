module.exports = function() {
	const mysql = require("mysql2/promise");
	return mysql.createPool({
		host: "cadence.gq",
		user: "amanda",
		password: (process.env.is_heroku)? process.env.auth:JSON.parse(fs.readFileSync("./auth.json", "utf8")),
		database: "money",
		connectionLimit: 5
	});
}