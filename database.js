module.exports = function() {
	const mysql = require("mysql2/promise");
	return mysql.createPool({
		host: "cadence.gq",
		user: "amanda",
		password: require("./auth.json").mysql_password,
		database: "money",
		connectionLimit: 5
	});
}