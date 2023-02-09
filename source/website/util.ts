import p from "path"
import fs from "fs"
import mime from "mime-types"
import { pipeline } from "stream"
import crypto from "crypto"

import { BackTracker } from "backtracker"

import passthrough from "../passthrough"
const { rootFolder, db, sync } = passthrough

const orm: typeof import("../client/utils/orm") = sync.require("../client/utils/orm")

export async function streamResponse(res: import("http").ServerResponse, fileDir: string, headersOnly = false, statusCode = 200, cameFrom404 = false): Promise<void> {
	let stats: import("fs").Stats
	try {
		stats = await fs.promises.stat(fileDir)
	} catch {
		if (!cameFrom404) return streamResponse(res, p.join(rootFolder, "/404.html"), headersOnly, 404, true)
		else return void res.writeHead(404).end();
	}

	if (!stats.isFile()) {
		if (!cameFrom404) return streamResponse(res, p.join(rootFolder, "/404.html"), headersOnly, 404, true)
		else return void res.writeHead(404).end();
	}

	const type = mime.lookup(fileDir) || "application/octet-stream"
	res.writeHead(statusCode, { "Content-Length": stats.size, "Content-Type": type })

	if (headersOnly) return void res.end()

	const stream = fs.createReadStream(fileDir)
	await new Promise((r, rej) => pipeline(stream, res, e => e ? rej(e) : r(void 0)))
	stream.destroy();
	res.destroy();
}

export function requestBody(req: import("http").IncomingMessage, timeout = 10000): Promise<Buffer> {
	if (!req.headers["content-length"]) throw new Error("CONTENT_LENGTH_REQURED")
	const sizeToMeet = Number(req.headers["content-length"])
	return new Promise<Buffer>((res, rej) => {
		let timer: NodeJS.Timeout | null = null
		let totalSize = 0
		const chunks: Array<Buffer> = []
		function onData(chunk: Buffer) {
			totalSize += chunk.byteLength
			if (totalSize > sizeToMeet) {
				req.removeListener("data", onData)
				req.removeListener("end", onEnd)
				return rej(new Error("BYTE_SIZE_DOES_NOT_MATCH_LENGTH"))
			}
			chunks.push(chunk)
		}
		function onEnd() {
			clearTimeout(timer!)
			req.removeListener("data", onData)
			res(Buffer.concat(chunks))
		}
		req.on("data", onData)
		req.once("end", onEnd)
		timer = setTimeout(() => {
			req.removeListener("data", onData)
			req.removeListener("end", onEnd)
			rej(new Error("TIMEOUT_WAITING_FOR_BODY_REACHED"))
		}, timeout)
	})
}

const boundaryReg = /^-+[^\n]+$/
const headerRegex = /([^:]+): *([^\r\n]+)/
const dispositionRegex = /^(\w+)="(.+)"$/
const semi = /; */g
const newLine = /\n/g

export function parseMultipartBody(body: string) {
	const split = body.split(newLine)
	let expectingBoundary = true
	let workingOnHeaders = false
	let contentBody = ""
	let headers: { [header: string]: string } = {}
	let disp: { [disposition: string]: string } = {}
	let param = 0
	let ret: { [param: number]: { headers: { [header: string]: string }; disposition: { [disposition: string]: string }; body: string; } } = {}
	for (const line of split) {
		let match: RegExpMatchArray | null = null
		if (expectingBoundary) match = line.match(boundaryReg)
		if (match) {
			if (contentBody.length || Object.keys(headers).length) {
				if (headers["content-disposition"]) {
					let split = headers["content-disposition"].split(semi)
					if (split[0] === "form-data") split = split.slice(1)
					for (const dp of split) {
						const dpMatch = dp.match(dispositionRegex)
						if (dpMatch) disp[dpMatch[1]] = dpMatch[2]
					}
				}
				ret[param++] = {
					headers,
					body: contentBody,
					disposition: disp
				}
				contentBody = ""
				headers = {}
				disp = {}
			}
			expectingBoundary = false
			workingOnHeaders = true
		} else {
			if (workingOnHeaders) {
				if (line.trim() === "") {
					workingOnHeaders = false
					expectingBoundary = true
				} else {
					const match = line.match(headerRegex)
					if (!match) console.log(`Line didn't match header regex and was expecting a header`)
					else headers[match[1].toLowerCase()] = match[2]
				}
			} else {
				contentBody += line
				contentBody += "\n"
			}
		}
	}
	return ret
}

export function generateCSRF(loginToken = null) {
	const token = crypto.randomBytes(32).toString("hex")
	const expires = Date.now() + 6 * 60 * 60 * 1000 // 6 hours
	db.query({ text: "INSERT INTO csrf_tokens (token, login_token, expires) VALUES ($1, $2, $3)", values: [token, loginToken, expires] })
	return token
}

export async function checkCSRF(token: string, loginToken?: string, consume?: boolean) {
	let result = true
	const row = await orm.db.get("csrf_tokens", { token })
	if (!row || (row.expires < Date.now()) || (loginToken && row.login_token != loginToken)) result = false
	if (consume) await orm.db.delete("csrf_tokens", { token })
	return result
}

export function getCookies(req: import("http").IncomingMessage) {
	const result = new Map<string, string>()
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
}

export function getSession(token: string | Map<string, string>) {
	if (token instanceof Map) token = token.get("token")!
	if (token) return orm.db.get("web_tokens", { token }).then(d => d || null)
	else return Promise.resolve(null)
}

export type Operation<T> = {
	code?(state: { [assign: string]: any }, nextValue: T): T | Promise<T>;
	assign?: string;
	expected?: ((value: T) => boolean) | T;
	errorValue?: [number, string] | string;
}

export class Validator {
	public state: Parameters<NonNullable<Operation<any>["code"]>>["0"] = {}
	public nextValue = undefined
	public operations: Array<Operation<any>> = []
	public stage = 0
	public promise: Promise<this["state"]>

	public do<T>(operation: Operation<T>): this
	public do<T>(operation: NonNullable<Operation<T>["code"]>, errorValue: [number, string] | string): this
	public do<T>(operation: NonNullable<Operation<T>["code"]>, expected: NonNullable<Operation<T>["expected"]>, errorValue: [number, string] | string): this
	public do<T>(operation: Operation<T>, errorValue: [number, string] | string): this
	public do<T>(operation: Operation<T>, expected: NonNullable<Operation<T>["expected"]>, errorValue: [number, string] | string): this
	public do<T>(operation: Operation<T> | NonNullable<Operation<T>["code"]>, errorOrExpected?: [number, string] | string | NonNullable<Operation<T>["expected"]>, errorValue?: [number, string] | string) {
		if (typeof (operation) == "function") operation = { code: operation }
		if (arguments.length == 2) operation.errorValue = errorOrExpected as [number, string]
		else if (arguments.length == 3) {
			operation.expected = errorOrExpected as NonNullable<Operation<T>["expected"]>
			operation.errorValue = errorValue
		}
		this.operations.push(operation)
		return this
	}

	public go() {
		if (!this.promise) this.promise = new Promise<this["state"]>((resolve, reject) => setImmediate(() => this._next(resolve, reject)))
		return this.promise
	}

	private _next(resolve: (value: this["state"]) => void, reject: Parameters<ConstructorParameters<PromiseConstructor>["0"]>["1"]) {
		if (this.operations.length == 0) return resolve(this.state)

		this.stage++
		const input = this.operations.shift()

		const processSuccess = (result: any) => {
			if (input?.expected) {
				if (typeof (input.expected) == "function") {
					if (!input.expected(result)) return processError()
				} else
				if (input.expected !== result) return processError()
			}
			if (input?.assign !== undefined) this.state[input.assign] = result
			this.nextValue = result
			this._next(resolve, reject)
		}

		const processError = () => {
			if (input?.errorValue !== undefined) reject(input.errorValue)
			else reject(new Error(`Unlabelled error in validator stage ${this.stage}`))
		}

		try {
			// @ts-expect-error
			const result = input.code(this.state, this.nextValue)
			if (result instanceof Promise) {
				result.then(processSuccess)
				result.catch(processError)
			} else processSuccess(result)
		} catch {
			processError()
		}
	}
}

export class FormValidator extends Validator {
	public trust({ req, body, config }: { req: import("http").IncomingMessage, body: string | Buffer, config: import("../types").Config }) {
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
		).do<any>({
			code: (_, bod) => new URLSearchParams(bod)
			, assign: "params"
			, errorValue: [400, "Failed to convert body to URLSearchParams"]
		})
		return this
	}

	public ensureParams(list: Array<string>, matchMode = "get") {
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

	public useCSRF(loginToken?: string) {
		this.do(
			() => checkCSRF(this.state.params.get("csrftoken"), loginToken, true)
			, true
			, [400, "Invalid CSRF token"]
		)
		return this
	}
}

export default exports as typeof import("./util")
