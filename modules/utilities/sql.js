// @ts-check

const util = require("util")

const passthrough = require("../../passthrough")
const { db } = passthrough

/**
 * @param {string} string
 * @param {string|number|symbol|Array<string|number|symbol>} [prepared=undefined]
 * @param {import("pg").PoolClient} [connection=undefined]
 * @param {number} [attempts=2]
 * @returns {Promise<Array<any>>}
 */
function all(string, prepared = undefined, connection = undefined, attempts = 2) {
	if (!connection) connection = db
	/** @type {Array<string|number|symbol>} */
	let prep
	if (prepared !== undefined && typeof (prepared) != "object") prep = [prepared]
	else if (prepared !== undefined && Array.isArray(prepared)) prep = prepared

	return new Promise((resolve, reject) => {
		if (Array.isArray(prepared) && prepared.includes(undefined)) {
			return reject(new Error(`Prepared statement includes undefined\n	Query: ${string}\n	Prepared: ${util.inspect(prepared)}`))
		}
		const query = { text: string, values: prep }
		connection.query(Array.isArray(prep) ? query : query.text).then(result => {
			const rows = result.rows
			resolve(rows)
		}).catch(err => {
			console.error(err)
			attempts--
			console.log(string, prepared)
			if (attempts) all(string, prep, connection, attempts).then(resolve).catch(reject)
			else reject(err)
		})
	})
}

/**
 * @param {string} string
 * @param {string|number|symbol|Array<(string|number|symbol)>} [prepared=undefined]
 * @param {import("pg").PoolClient} [connection=undefined]
 * @returns {Promise<any>}
 */
async function get(string, prepared = undefined, connection = undefined) {
	const rows = await all(string, prepared, connection)
	return rows[0]
}

/**
 * @param {import("thunderstorm").User} user
 * @param {"eval"|"owner"} permission
 * @returns {Promise<boolean>}
 */
async function hasPermission(user, permission) {
	let result = await get(`SELECT ${permission} FROM user_permissions WHERE user_id = $1`, user.id)
	if (result) result = Object.values(result)[0]
	return !!result
}

module.exports.all = all
module.exports.get = get
module.exports.hasPermission = hasPermission
