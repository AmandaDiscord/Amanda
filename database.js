module.exports = function() {
	const mysql = require("mysql2/promise");
	return mysql.createPool({
		host: "cadence.gq",
		user: "amanda",
		password: (process.env.is_heroku)? JSON.parse(process.env.auth).mysql_password:JSON.parse(fs.readFileSync("./auth.json", "utf8")),
		database: "money",
		connectionLimit: 5
	});
}