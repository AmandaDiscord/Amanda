// @ts-check

const mysql = require("mysql2/promise")
const crypto = require("crypto")
const util = require("util")

const passthrough = require("../passthrough")
const { db, ipc } = passthrough

const utils = {
	sql: {
		/**
		 * @param {string} string
		 * @param {string|number|symbol|Array<(string|number|symbol)>} [prepared]
		 * @param {mysql.PromisePool|mysql.PromisePoolConnection} [connection]
		 * @param {number} [attempts=2]
		 * @returns {Promise<Array<any>>}
		 */
		"all": function(string, prepared = undefined, connection = undefined, attempts = 2) {
			if (!connection) connection = db
			if (prepared !== undefined && typeof (prepared) != "object") prepared = [prepared]
			return new Promise((resolve, reject) => {
				if (Array.isArray(prepared) && prepared.includes(undefined)) return reject(new Error(`Prepared statement includes undefined\n	Query: ${string}\n	Prepared: ${util.inspect(prepared)}`))
				connection.execute(string, prepared).then(result => {
					const rows = result[0]
					resolve(rows)
				}).catch(err => {
					console.error(err)
					attempts--
					if (attempts) utils.sql.all(string, prepared, connection, attempts).then(resolve).catch(reject)
					else reject(err)
				})
			})
		},
		/**
		 * @param {string} string
		 * @param {string|number|symbol|Array<(string|number|symbol)>} [prepared]
		 * @param {mysql.PromisePool|mysql.PromisePoolConnection} [connection]
		 */
		"get": async function(string, prepared = undefined, connection = undefined) {
			return (await utils.sql.all(string, prepared, connection))[0]
		}
	},

	/**
	 * @returns {mysql.PromisePoolConnection}
	 */
	getConnection: function() {
		return db.getConnection()
	},

	/**
	 * Convert a browser cookie string into a map.
	 * @param {Object} req req, from HTTP.Server
	 * @returns {Map}
	 */
	getCookies: function(req) {
		const result = new Map()
		if (req.headers.cookie) {
			req.headers.cookie.split(/; */).forEach(pair => {
				const eqIndex = pair.indexOf("=")
				if (eqIndex > 0) {
					const key = pair.slice(0, eqIndex)
					const value = pair.slice(eqIndex + 1)
					result.set(key, value)
				}
			})
		}
		return result
	},

	/**
	 * Get a session from a token or a cookie map. Returns null if no session.
	 * @param {string|Map<string, string>} token
	 * @returns {Promise<{userID: string, token: string, staging: number}>}
	 */
	getSession: function(token) {
		if (token instanceof Map) token = token.get("token")
		if (token) {
			return utils.sql.get("SELECT * FROM WebTokens WHERE token = ?", token).then(row => {
				if (row) return row
				else return null
			})
		} else return Promise.resolve(null)
	},

	generateCSRF: function(loginToken = null) {
		const token = crypto.randomBytes(32).toString("hex")
		const expires = Date.now() + 6 * 60 * 60 * 1000 // 6 hours
		utils.sql.all("INSERT INTO CSRFTokens (token, loginToken, expires) VALUES (?, ?, ?)", [token, loginToken, expires])
		return token
	},

	checkCSRF: async function(token, loginToken, consume) {
		let result = true
		const row = await utils.sql.get("SELECT * FROM CSRFTokens WHERE token = ?", token)
		// Token doesn't exist? Fail.
		if (!row) result = false
		// Expired? Fail.
		else if (row.expires < Date.now()) result = false
		// Checking against a loginToken, but row loginToken differs? Fail.
		else if (loginToken && row.loginToken != loginToken) result = false
		// Looking good.
		if (consume) await utils.sql.all("DELETE FROM CSRFTokens WHERE token = ?", token)
		return result
	},

	AsyncValueCache:
	/** @template T */
	class AsyncValueCache {
		/**
		 * @param {() => Promise<T>} getter
		 * @param {number} lifetime
		 */
		constructor(getter, lifetime = undefined) {
			this.getter = getter
			this.lifetime = lifetime
			this.lifetimeTimeout = null
			/** @type {Promise<T>} */
			this.promise = null
			/** @type {T} */
			this.cache = null
			this.cacheExists = false
		}
		clear() {
			clearTimeout(this.lifetimeTimeout)
			this.cache = null
			this.cacheExists = false
		}
		get() {
			if (this.cacheExists) return Promise.resolve(this.cache)
			if (this.promise) return this.promise
			return this._getNew()
		}
		_getNew() {
			return this.promise = this.getter().then(result => {
				this.cacheExists = true
				this.cache = result
				this.promise = null
				clearTimeout(this.lifetimeTimeout)
				if (this.lifetime) this.lifetimeTimeout = setTimeout(() => this.clear(), this.lifetime)
				return result
			})
		}
	},

	UpdatingValueCache:
	/** @template T */
	class UpdatingValueCache {
		/**
		 * @param {() => Promise<T>} getter
		 */
		constructor(getter) {
			this.avc = new utils.AsyncValueCache(getter)
			this.pending = []
			this.pendingPromiseAdded = false
			this.get()
		}

		/**
		 * @param {(cache: T) => any} updateFn
		 */
		update(updateFn) {
			if (this.avc.cacheExists) this.applyUpdate(updateFn)
			else {
				this.pending.push(updateFn)
				if (!this.pendingPromiseAdded) {
					this.pendingPromiseAdded = true
					this.avc.get().then(() => this.applyUpdates())
				}
			}
		}

		get() {
			return this.avc.get()
		}

		applyUpdates() {
			this.pending.forEach(updateFn => {
				this.applyUpdate(updateFn)
			})
			this.pending = []
		}

		applyUpdate(fn) {
			this.avc.cache = fn(this.avc.cache)
			if (this.avc.cache === undefined) console.log("UVC.update() returned undefined. This is probably not supposed to happen!")
		}
	}
}

module.exports = utils
