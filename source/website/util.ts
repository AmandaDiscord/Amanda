import p = require("path")
import fs = require("fs")
import mime = require("mime-types")
import { pipeline } from "stream"
import crypto = require("crypto")

import passthrough = require("../passthrough")
const { rootFolder, db, sync, config } = passthrough

const orm: typeof import("../client/utils/orm") = sync.require("../client/utils/orm")
const spaceRegex = / /g
const colonRegex = /:/g
const semiRegex = /;/g
const commaRegex = /,/g
const slashSingleRegex = /\//
const toEndOfSemiRegex = /([^;]+);?/

const dateDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const dateMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


export function checkDateHeader(date?: string): boolean {
	if (!date) return false
	if (!dateDays.includes(date.slice(0, 3))) {
		console.log(date.slice(0, 3), " is not in date days")
		return false
	}
	const [day, month, year, time, tz] = date.slice(5).split(spaceRegex)
	if (day?.length !== 2) {
		console.log(day, " day length is not 2")
		return false
	}
	if (!dateMonths.includes(month)) {
		console.log(month, " is not in date months")
		return false
	}
	if (year?.length !== 4) {
		console.log(year, " year length is not 4")
		return false // sucks for people past Year 9999, but the HTTP spec says 4 digit
	}
	const [hour, minute, second] = time?.split(colonRegex)
	if (hour?.length !== 2) {
		console.log(hour, " hour length is not 2")
		return false
	}
	if (minute?.length !== 2) {
		console.log(minute, " minute length is not 2")
		return false
	}
	if (second?.length !== 2) {
		console.log(second, " second length is not 2")
		return false
	}
	if (tz !== "GMT") {
		console.log(tz, " timezone is not GMT")
		return false
	}
	return true
}

export async function streamResponse(req: import("http").IncomingMessage, res: import("http").ServerResponse, fileDir: string, headersOnly = false, statusCode = 200, cameFrom404 = false): Promise<void> {
	let stats: import("fs").Stats
	try {
		stats = await fs.promises.stat(fileDir)
	} catch {
		if (!cameFrom404) return streamResponse(req, res, p.join(rootFolder, "./404.html"), headersOnly, 404, true)
		else return void res.writeHead(404).end();
	}

	if (!stats.isFile()) {
		if (!cameFrom404) return streamResponse(req, res, p.join(rootFolder, "./404.html"), headersOnly, 404, true)
		else return void res.writeHead(404).end();
	}

	if (stats.size === 0) return void res.writeHead(204).end()

	const type = mime.lookup(fileDir) || "application/octet-stream"

	const acceptable = req.headers["accept"] || "*/*"
	const splitAccept = acceptable.split(commaRegex)
	const canAccept = splitAccept.some(i => {
		const [reqNamespace, reqType] = i.split(slashSingleRegex)
		if (!reqNamespace || !reqType) return false
		const vWithoutQ = reqType.match(toEndOfSemiRegex)
		if (!vWithoutQ) return false
		const [resNamespace, resType] = type.split(slashSingleRegex)
		if (reqNamespace !== "*" && resNamespace !== reqNamespace) return false
		if (reqType !== "*" && resType !== reqType) return false
		return true
	})
	if (!canAccept) return void res.writeHead(406).end()

	const writeHeaders = { "Content-Length": stats.size, "Content-Type": type, "Last-Modified": stats.mtime.toUTCString(), "Cache-Control": "no-cache" }

	if (!cameFrom404 && ["GET", "HEAD"].includes(req.method?.toUpperCase() || "")) { // check modified header(s)
		if (checkDateHeader(req.headers["if-modified-since"])) {
			const expecting = new Date(req.headers["if-modified-since"]!)
			if (stats.mtimeMs >= expecting.getTime()) {
				statusCode = 304
				headersOnly = true
			}
		}
	}
	res.writeHead(statusCode, writeHeaders)

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

export function generateCSRF(loginToken: string | null = null) {
	const token = crypto.randomBytes(32).toString("hex")
	const expires = Date.now() + 6 * 60 * 60 * 1000 // 6 hours
	db?.query({ text: "INSERT INTO csrf_tokens (token, login_token, expires) VALUES ($1, $2, $3)", values: [token, loginToken, expires] })
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

type State = {}

export class Validator<S extends State, P> {
	public state = {} as S
	public previousValue: P
	public operations: Array<{ expected: any, assign: string | undefined, errorValue: [number, string] | string | undefined, code: (state: S, previousValue: P) => any }> = []
	public stage = 0
	public promise: Promise<S>

	public do<C extends (state: S, previousValue: P) => unknown | Promise<unknown>, A extends undefined>(code: C, expected?: ((value: Awaited<ReturnType<C>>) => boolean) | Awaited<ReturnType<C>> | undefined, errorValue?: [number, string] | string | undefined, assign?: A): Validator<S, Awaited<ReturnType<C>>>
	public do<C extends (state: S, previousValue: P) => unknown | Promise<unknown>, A extends string>(code: C, expected?: ((value: Awaited<ReturnType<C>>) => boolean) | Awaited<ReturnType<C>> | undefined, errorValue?: [number, string] | string | undefined, assign?: A): Validator<S & { [K in A]: Awaited<ReturnType<C>> }, Awaited<ReturnType<C>>>
	public do<C extends (state: S, previousValue: P) => unknown | Promise<unknown>, A extends string | undefined>(code: C, expected?: ((value: Awaited<ReturnType<C>>) => boolean) | Awaited<ReturnType<C>> | undefined, errorValue?: [number, string] | string | undefined, assign?: A): this | Validator<S & { [K in A extends undefined ? never : A]: Awaited<ReturnType<C>> }, Awaited<ReturnType<C>>> {
		this.operations.push({ expected, assign, errorValue, code })
		return this
	}

	public go(): Promise<S> {
		if (!this.promise) this.promise = new Promise<S>((resolve, reject) => setImmediate(() => this._next(resolve, reject)))
		return this.promise
	}

	private async _next(resolve: (value: S | PromiseLike<S>) => void, reject: (reason?: [number, string] | string) => void) {
		if (this.operations.length == 0) return resolve(this.state)

		this.stage++
		const input = this.operations.shift()
		if (!input) return reject([500, "NO_INPUT"])

		const processSuccess = (result: any) => {
			if (input.expected && ((typeof input.expected === "function" && !input.expected(result)) || input.expected !== result)) return processError()
			if (input.assign !== undefined) this.state[input.assign as keyof S] = result
			this.previousValue = result
			this._next(resolve, reject)
		}

		const processError = () => {
			if (input.errorValue !== undefined) reject(input.errorValue)
			else reject(`Unlabelled error in validator stage ${this.stage}`)
		}

		try {
			const result = input.code(this.state, this.previousValue)
			if (result instanceof Promise) await result.then(processSuccess)
			else processSuccess(result)
		} catch {
			processError()
		}
	}
}

export class FormValidator<S extends State, P> extends Validator<S, P> {
	public trust({ req, body }: { req: import("http").IncomingMessage, body: string | Buffer }): FormValidator<S & { params: URLSearchParams }, URLSearchParams> {
		if (!req || !body || !config) throw new Error("Not all parameters were passed")
		this.do(
			() => req.headers["origin"] || req.headers["referer"] || "",
			(v: string) => {
				if (v.startsWith(`${config.website_protocol}://${config.website_domain}`)) return true
				if (config.website_domain.startsWith("localhost") && req.headers.host && v.startsWith(`http://${req.headers.host}`)) return true
				return false
			},
			[400, "Origin or referer must start with the current domain"]
		).do(
			() => req.headers["content-type"] || "",
			"application/x-www-form-urlencoded",
			[400, "Content-Type must be application/x-www-form-urlencoded"]
		).do(
			() => body.toString("ascii"),
			undefined,
			[400, "Failed to convert body to a string"]
		).do(
			(_, bod) => new URLSearchParams(bod),
			undefined,
			[400, "Failed to convert body to URLSearchParams"],
			"params"
		)
		return this as unknown as FormValidator<S & { params: URLSearchParams }, URLSearchParams>
	}

	public ensureParams(list: Array<string>, matchMode: "get" | "has" = "get") {
		if (!(list instanceof Array)) list = [list]
		list.forEach(item => {
			// @ts-expect-error
			this.do<(state: S & { params: URLSearchParams }, previousValue: P) => boolean, undefined>(
				state => !!state.params[matchMode](item),
				v => v,
				[400, `Missing ${item}`]
			)
		})
		return this
	}

	public useCSRF(loginToken?: string) {
		// @ts-expect-error
		this.do<(state: S & { params: URLSearchParams }, previousValue: P) => boolean, undefined>(
			state => checkCSRF(state.params.get("csrftoken")!, loginToken, true),
			true,
			[400, "Invalid CSRF token"]
		)
		return this
	}
}
