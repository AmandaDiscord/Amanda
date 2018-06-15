module.exports = function() {
	const mysql = require("mysql2/promise");
	return mysql.createConnection({
		host: 'cadence.gq',
		user: 'amanda',
		password: "password",
		database: 'money'
	});
}