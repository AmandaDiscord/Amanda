// @ts-check

const crypto = require("crypto")
const util = require("util")
const events = require("events")

const passthrough = require("../passthrough")
const { db, reloader } = passthrough

const utils = {
	sql: {
		/**
		 * @param {string} string
		 * @param {string|number|symbol|Array<string|number|symbol>} [prepared=undefined]
		 * @param {import("pg").PoolClient} [connection=undefined]
		 * @param {number} [attempts=2]
		 * @returns {Promise<Array<any>>}
		 */
	all: function(string, prepared = undefined, connection = undefined, attempts = 2) {
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
				if (attempts) utils.sql.all(string, prep, connection, attempts).then(resolve).catch(reject)
				else reject(err)
			})
		})
	},
		/**
		 * @param {string} string
		 * @param {string|number|symbol|Array<(string|number|symbol)>} [prepared=undefined]
		 * @param {import("pg").PoolClient} [connection=undefined]
		 * @returns {Promise<any>}
		 */
		get: async function(string, prepared = undefined, connection = undefined) {
			return (await utils.sql.all(string, prepared, connection))[0]
		}
	},

	/**
	 * @param {events.EventEmitter} target
	 * @param {string} name
	 * @param {string} filename
	 * @param {(...args: Array<any>) => any} code
	 */
	addTemporaryListener: function(target, name, filename, code, targetListenMethod = "on") {
		console.log(`added event ${name}`)
		target[targetListenMethod](name, code)
		reloader.reloadEvent.once(filename, () => {
			target.removeListener(name, code)
			console.log(`removed event ${name}`)
		})
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
	 * @returns {Promise<{user_id: string, token: string, staging: number}>}
	 */
	getSession: function(token) {
		if (token instanceof Map) token = token.get("token")
		if (token) {
			return utils.sql.get("SELECT * FROM web_tokens WHERE token = $1", token).then(row => {
				if (row) return row
				else return null
			})
		} else return Promise.resolve(null)
	},

	generateCSRF: function(loginToken = null) {
		const token = crypto.randomBytes(32).toString("hex")
		const expires = Date.now() + 6 * 60 * 60 * 1000 // 6 hours
		utils.sql.all("INSERT INTO csrf_tokens (token, login_token, expires) VALUES (?, ?, ?)", [token, loginToken, expires])
		return token
	},

	checkCSRF: async function(token, loginToken, consume) {
		let result = true
		const row = await utils.sql.get("SELECT * FROM csrf_tokens WHERE token = $1", token)
		// Token doesn't exist? Fail.
		// Expired? Fail.
		// Checking against a loginToken, but row loginToken differs? Fail.
		if (!row || (row.expires < Date.now()) || (loginToken && row.login_token != loginToken)) result = false
		// Looking good.
		if (consume) await utils.sql.all("DELETE FROM csrf_tokens WHERE token = $1", token)
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
