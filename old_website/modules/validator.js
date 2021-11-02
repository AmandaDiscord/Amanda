// @ts-check

/**
 * @typedef {Object} Operation
 * @property {(state: any, nextValue: any) => Promise<any>} code
 * @property {string} assign
 * @property {any} expected
 * @property {any} errorValue
 */

class Validator {
	constructor() {
		this.state = {}
		this.nextValue = undefined
		/** @type {Operation[]} */
		this.operations = []
		this.stage = 0
	}

	do() {
		let operation = arguments[0]
		if (typeof (operation) == "function") operation = { code: operation }
		if (arguments.length == 2) operation.errorValue = arguments[1]
		else if (arguments.length == 3) {
			operation.expected = arguments[1]
			operation.errorValue = arguments[2]
		}
		this.operations.push(operation)
		return this
	}

	go() {
		if (this.promise) return this.promise
		else {
			return this.promise = new Promise((resolve, reject) => {
				setImmediate(() => this._next(resolve, reject))
			})
		}
	}

	_next(resolve, reject) {
		if (this.operations.length == 0) return resolve(this.state)

		this.stage++
		const input = this.operations.shift()

		const processSuccess = result => {
			if (Object.keys(input).includes("expected")) {
				if (typeof (input.expected) == "function") {
					if (!input.expected(result)) return processError()
				} else
				if (input.expected !== result) return processError()

			}
			if (input.assign !== undefined) this.state[input.assign] = result
			this.nextValue = result
			this._next(resolve, reject)
		}

		const processError = () => {
			if (input.errorValue !== undefined) reject(input.errorValue)
			else reject(`Unlabelled error in validator stage ${this.stage}`)
		}

		try {
			const result = input.code(this.state, this.nextValue)
			if (result instanceof Promise) {
				result.then(processSuccess)
				result.catch(processError)
			} else processSuccess(result)

		} catch (error) {
			processError()
		}
	}
}

class FormValidator extends Validator {
	constructor() {
		super()
	}

	/**
	 * @param {object} input
	 * @param {any} input.req
	 * @param {any} input.body
	 * @param {import("../../config")} input.config
	 */
	trust({ req, body, config }) {
		if (!req || !body || !config) throw new Error("Not all parameters were passed")
		this.do(
			() => req.headers["origin"] || req.headers["referer"] || ""
			, v => {
				if (v.startsWith(`${config.website_protocol}://${config.website_domain}`)) return true
				if (config.website_domain.startsWith("localhost") && req.headers.host && v.startsWith(`http://${req.headers.host}`)) return true
				return false
			}
			, [400, "Origin or referer must start with the current domain"]
		).do(
			() => req.headers["content-type"]
			, "application/x-www-form-urlencoded"
			, [400, "Content-Type must be application/x-www-form-urlencoded"]
		).do(
			() => typeof (body) == "string" ? body : body.toString("ascii")
			, [400, "Failed to convert body to a string"]
		).do({
			code: (_, bod) => new URLSearchParams(bod)
			, assign: "params"
			, errorValue: [400, "Failed to convert body to URLSearchParams"]
		})
		return this
	}

	ensureParams(list, matchMode = "get") {
		if (!(list instanceof Array)) list = [list]
		list.forEach(item => {
			this.do(
				(_) => _.params[matchMode](item)
				, v => v
				, [400, `Missing ${item}`]
			)
		})
		return this
	}

	useCSRF(extra, loginToken) {
		this.do(
			() => extra.checkCSRF(this.state.params.get("csrftoken"), loginToken, true)
			, true
			, [400, "Invalid CSRF token"]
		)
		return this
	}
}

module.exports = () => ({ Validator, FormValidator })
