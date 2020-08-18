// @ts-check

const util = require("util")

const passthrough = require("../../passthrough")
const { db } = passthrough

/**
 * @param {string} string
 * @param {string|number|symbol|Array<(string|number|symbol)>} [prepared=undefined]
 * @param {import("mysql2/promise").Pool|import("mysql2/promise").PoolConnection} [connection=undefined]
 * @param {number} [attempts=2]
 * @returns {Promise<Array<import("mysql2/promise").RowDataPacket>>}
 */
function all(string, prepared = undefined, connection = undefined, attempts = 2) {
	if (!connection) connection = db
	if (prepared !== undefined && typeof (prepared) != "object") prepared = [prepared]
	return new Promise((resolve, reject) => {
		if (Array.isArray(prepared) && prepared.includes(undefined)) {
			return reject(new Error(`Prepared statement includes undefined\n	Query: ${string}\n	Prepared: ${util.inspect(prepared)}`))
		}
		connection.execute(string, prepared).then(result => {
			const rows = result[0]
			// @ts-ignore
			resolve(rows)
		}).catch(err => {
			console.error(err)
			attempts--
			if (attempts) all(string, prepared, connection, attempts).then(resolve).catch(reject)
			else reject(err)
		})
	})
}

/**
 * @param {string} string
 * @param {string|number|symbol|Array<(string|number|symbol)>} [prepared=undefined]
 * @param {import("mysql2/promise").Pool|import("mysql2/promise").PoolConnection} [connection=undefined]
 * @returns {Promise<import("mysql2/promise").RowDataPacket>}
 */
function get(string, prepared = undefined, connection = undefined) {
	return all(string, prepared, connection).then(rows => rows[0])
}

function getConnection() {
	return db.getConnection()
}

/**
 * @param {import("thunderstorm").User} user
 * @param {"eval"|"owner"} permission
 * @returns {Promise<boolean>}
 */
async function hasPermission(user, permission) {
	let result = await get(`SELECT ${permission} FROM UserPermissions WHERE userID = ?`, user.id)
	if (result) result = Object.values(result)[0]
	return !!result
}

module.exports.all = all
module.exports.get = get
module.exports.getConnection = getConnection
module.exports.hasPermission = hasPermission
