import fs = require("fs")
import p = require("path")
import crypto = require("crypto")

import mime = require("mime-types")

import sharedUtils = require("@amanda/shared-utils")
import buttons = require("@amanda/buttons")

import passthrough = require("./passthrough")
const { rootFolder, sql, confprovider, lavalink, commands, snow, commandWorkers, queues, sessions } = passthrough

import type { HttpResponse, WebSocket } from "uWebSockets.js"
import type { Readable } from "stream"
import type { IGatewayMessage } from "cloudstorm"
import type { APIUser, APIMessageComponentInteractionData, APIMessageComponentInteraction, APIChatInputApplicationCommandInteraction } from "discord-api-types/v10"
import type { VoiceStateUpdate, VoiceServerUpdate } from "lavacord"

const commaRegex = /,/g
const slashSingleRegex = /\//
const toEndOfSemiRegex = /([^;]+);?/

export function toArrayBuffer(buffer: Buffer): ArrayBuffer {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

export function onAbortedOrFinishedResponseStream(res: HttpResponse, readStream: Readable): void {
	if (res.id !== -1) readStream.destroy()
	res.id = -1
}

export function streamResponse(res: HttpResponse, readStream: Readable, totalSize: number): Promise<void> {
	let resolveOuter: (value: void) => void
	let cancel = false
	res.onAborted(() => {
		onAbortedOrFinishedResponseStream(res, readStream)
		if (!resolveOuter) cancel = true
		else resolveOuter()
	})
	return new Promise((resolve, reject) => {
		if (cancel) return resolve()
		resolveOuter = reject
		readStream.on("data", chunk => {
			const ab = toArrayBuffer(chunk)
			const lastOffset = res.getWriteOffset()

			res.cork(() => {
				const [ok, done] = res.tryEnd(ab, totalSize)

				if (done) {
					onAbortedOrFinishedResponseStream(res, readStream)
					resolve(void 0)
				} else if (!ok) {
					readStream.pause()
					res.ab = ab
					res.abOffset = lastOffset

					res.onWritable(offset => {
						const [ok2, done2] = res.tryEnd(res.ab.slice(offset - res.abOffset), totalSize)
						if (done2) {
							onAbortedOrFinishedResponseStream(res, readStream)
							resolve(void 0)
						} else if (ok2) readStream.resume()
						return ok2
					})
				}
			})

		}).once("error", e => {
			readStream.destroy()
			res.end()
			reject(e)
		})
	})
}

export function attachResponseAbortListener(res: HttpResponse): void {
	res.continue = true
	res.onAborted(() => res.continue = false)
}

export async function streamFile(path: string, res: HttpResponse, acceptHead?: string, ifModifiedSinceHeader?: string, headersOnly = false, status = 200, cameFrom404 = false): Promise<void> {
	attachResponseAbortListener(res)
	let stats: import("fs").Stats
	const joined = p.join(rootFolder, path)
	try {
		stats = await fs.promises.stat(joined)
		if (!res.continue) return
	} catch {
		console.log(`404 ${path}`)
		if (!res.continue) return
		if (!cameFrom404) return streamFile("404.html", res, acceptHead, ifModifiedSinceHeader, headersOnly, 404, true)
		else return void res.cork(() => res.writeStatus("404").endWithoutBody())
	}

	if (!stats.isFile()) {
		if (!cameFrom404) return streamFile("404.html", res, acceptHead, ifModifiedSinceHeader, headersOnly, 404, true)
		else return void res.cork(() => res.writeStatus("404").endWithoutBody())
	}

	if (stats.size === 0) return void res.cork(() => res.writeStatus("204").endWithoutBody())

	const type = mime.lookup(path) || "application/octet-stream"

	const acceptable = acceptHead ?? "*/*"
	const splitAccept = acceptable.split(commaRegex)
	const canAccept = splitAccept.some(i => {
		const [reqNamespace, reqType] = i.split(slashSingleRegex)
		if (!reqNamespace || !reqType) return false
		const vWithoutQ = toEndOfSemiRegex.exec(reqType)
		if (!vWithoutQ) return false
		const [resNamespace, resType] = type.split(slashSingleRegex)
		if (reqNamespace !== "*" && resNamespace !== reqNamespace) return false
		if (vWithoutQ[1] !== "*" && resType !== vWithoutQ[1]) return false
		return true
	})
	if (!canAccept) return void res.cork(() => res.writeStatus("406").endWithoutBody())
	if (!cameFrom404 && ifModifiedSinceHeader) { // check modified header(s)
		if (sharedUtils.checkDateHeader(ifModifiedSinceHeader)) {
			const expecting = new Date(ifModifiedSinceHeader)
			if (stats.mtimeMs >= expecting.getTime()) {
				status = 304
				headersOnly = true
			}
		}
	}
	res.cork(() => {
		res.writeStatus(String(status))
		res.writeHeader("Content-Length", String(stats.size))
		res.writeHeader("Content-Type", type)
		res.writeHeader("Last-Modified", stats.mtime.toUTCString())
		res.writeHeader("Cache-Control", "no-cache")
	})

	if (headersOnly) return void res.cork(() => res.endWithoutBody())
	const stream = fs.createReadStream(joined)
	await streamResponse(res, stream, stats.size)
}

export function redirect(res: HttpResponse, location: string) {
	const bod = `Redirecting to <a href="${location}">${location}</a>...`
	res.cork(() => {
		res
			.writeStatus("303")
			.writeHeader("Location", location)
			.writeHeader("Content-Type", "text/html")
			.writeHeader("Content-Length", String(Buffer.byteLength(bod)))
			.end(bod)
	})
}

export function generateCSRF(loginToken: string | null = null) {
	const token = crypto.randomBytes(32).toString("hex")
	const expires = Date.now() + 6 * 60 * 60 * 1000 // 6 hours
	sql.raw("INSERT INTO csrf_tokens (token, login_token, expires) VALUES ($1, $2, $3)", [token, loginToken, expires]).catch(console.error)
	return token
}

export async function checkCSRF(token: string, loginToken?: string, consume?: boolean) {
	let result = true
	const row = await sql.orm.get("csrf_tokens", { token })
	if (!row || (row.expires < Date.now()) || (loginToken && row.login_token != loginToken)) result = false
	if (consume) await sql.orm.delete("csrf_tokens", { token })
	return result
}

const anyAfterSemiRegex = /; */

export function getCookies(cookie: string | undefined) {
	const result = new Map<string, string>()
	if (cookie) {
		cookie.split(anyAfterSemiRegex).forEach(pair => {
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
	if (token) return sql.orm.get("web_tokens", { token }).then(d => d ?? null)
	else return Promise.resolve(null)
}

export function requestBody(res: HttpResponse, length: number): Promise<Buffer> {
	return new Promise((resolve, rej) => {
		const acc = new sharedUtils.BufferAccumulator(length)
		res.onData((chunk, isLast) => {
			acc.add(Buffer.from(chunk))
			if (isLast) resolve(acc.concat() ?? Buffer.allocUnsafe(0))
		})
		res.onAborted(() => rej(new Error("ABORTED")))
	})
}

type State = object

export class Validator<S extends State, P> {
	public state = {} as S
	public previousValue: P
	public operations: Array<{ expected: unknown, assign: string | undefined, errorValue: [number, string] | undefined, code: (state: S, previousValue: P) => unknown }> = []
	public stage = 0
	public promise: Promise<S> | undefined = void 0

	public do<C extends (state: S, previousValue: P) => unknown, A extends undefined>(code: C, expected?: ((value: Awaited<ReturnType<C>>) => boolean) | Awaited<ReturnType<C>> | undefined, errorValue?: [number, string] | undefined, assign?: A): Validator<S, Awaited<ReturnType<C>>>
	public do<C extends (state: S, previousValue: P) => unknown, A extends string>(code: C, expected?: ((value: Awaited<ReturnType<C>>) => boolean) | Awaited<ReturnType<C>> | undefined, errorValue?: [number, string] | undefined, assign?: A): Validator<S & { [K in A]: Awaited<ReturnType<C>> }, Awaited<ReturnType<C>>>
	public do<C extends(state: S, previousValue: P) => unknown, A extends string | undefined>(code: C, expected?: ((value: Awaited<ReturnType<C>>) => boolean) | Awaited<ReturnType<C>> | undefined, errorValue?: [number, string] | undefined, assign?: A): this {
		this.operations.push({ expected, assign, errorValue, code })
		return this
	}

	public go(): Promise<S> {
		if (!this.promise) this.promise = new Promise<S>((resolve, reject) => setImmediate(() => void this._next(resolve, reject)))
		return this.promise
	}

	private async _next(resolve: (value: S | PromiseLike<S>) => void, reject: (reason?: [number, string]) => void): Promise<void> {
		if (this.operations.length == 0) return resolve(this.state)

		this.stage++
		const input = this.operations.shift()
		if (!input) return reject([500, "NO_INPUT"])

		const processSuccess = async (result: unknown) => {
			if (input.expected && (typeof input.expected === "function" ? !input.expected(result) : input.expected !== result)) return processError()
			// @ts-expect-error They are assignable
			if (input.assign !== undefined) this.state[input.assign as keyof S] = result
			this.previousValue = result as P
			await this._next(resolve, reject)
		}

		const processError = () => {
			if (input.errorValue !== void 0) reject(input.errorValue)
			else reject([500, `Unlabelled error in validator stage ${this.stage}`])
		}

		try {
			const result = input.code(this.state, this.previousValue)
			if (result instanceof Promise) await result.then(processSuccess)
			else await processSuccess(result)
		} catch {
			processError()
		}
	}
}

export class FormValidator<S extends State, P> extends Validator<S, P> {
	public trust({
		origin,
		referrer,
		host,
		body,
		contentType
	}: {
		origin: string | undefined,
		referrer: string | undefined,
		host: string | undefined,
		body: string | Buffer,
		contentType: string | undefined
	}): FormValidator<S & { params: URLSearchParams }, URLSearchParams> {
		if (!body) throw new Error("Not all parameters were passed")
		this.do(
			() => origin ?? referrer ?? "",
			(v: string) => {
				if (v.startsWith(`${confprovider.config.website_protocol}://${confprovider.config.website_domain}`)) return true
				if (confprovider.config.website_domain.startsWith("localhost") && host && v.startsWith(`http://${host}`)) return true
				return false
			},
			[400, "Origin or referer must start with the current domain"]
		).do(
			() => contentType ?? "",
			"application/x-www-form-urlencoded",
			[400, "Content-Type must be application/x-www-form-urlencoded"]
		).do(
			() => body.toString("ascii"),
			void 0,
			[400, "Failed to convert body to a string"]
		).do(
			(_, bod) => new URLSearchParams(bod),
			void 0,
			[400, "Failed to convert body to URLSearchParams"],
			"params"
		)
		return this as unknown as FormValidator<S & { params: URLSearchParams }, URLSearchParams>
	}

	public ensureParams(list: Array<string>, matchMode: "get" | "has" = "get"): this {
		if (!(list instanceof Array)) list = [list]
		list.forEach(item => {
			// @ts-expect-error TypeScript doesn't know what it's talking about
			this.do<(state: S & { params: URLSearchParams }, previousValue: P) => boolean, undefined>(
				state => !!state.params[matchMode](item),
			v => v,
			[400, `Missing ${item}`]
			)
		})
		return this
	}

	public useCSRF(loginToken?: string): this {
		// @ts-expect-error TypeScript doesn't know what it's talking about
		this.do<(state: S & { params: URLSearchParams }, previousValue: P) => boolean, undefined>(
			state => checkCSRF(state.params.get("csrftoken")!, loginToken, true),
		true,
		[400, "Invalid CSRF token"]
		)
		return this
	}
}

export async function onGatewayMessage(
	ws: WebSocket<{ worker: import("./ws/gateway").GatewayWorker; clusterID: string }>,
	message: ArrayBuffer
) {
	const parsed: IGatewayMessage & { cluster_id: string } = JSON.parse(Buffer.from(message).toString())
	const wsData = ws.getUserData()
	parsed.cluster_id = wsData.clusterID

	// @ts-expect-error Custom Event
	if (parsed.t === "SHARD_LIST") wsData.worker.shards = parsed.d
	else if (parsed.t === "VOICE_STATE_UPDATE") {
		if (!parsed.d.guild_id) return
		lavalink.voiceStateUpdate(parsed.d as VoiceStateUpdate)
		queues.get(parsed.d.guild_id)?.voiceStateUpdate(parsed.d)
	} else if (parsed.t === "VOICE_SERVER_UPDATE") lavalink.voiceServerUpdate(parsed.d as VoiceServerUpdate)
	else if (parsed.t === "INTERACTION_CREATE") {
		const user = parsed.d.member?.user ?? parsed.d.user
		sharedUtils.updateUser(user)
		if (parsed.d.type === 2) {
			let commandHandled = false
			if (commands.handle(parsed.d as APIChatInputApplicationCommandInteraction, snow)) commandHandled = true
			if (!commandHandled && !commandWorkers.length) return console.warn("No command workers to handle interaction")
			if (!commandHandled) {
				const worker = sharedUtils.arrayRandom(commandWorkers)
				worker.send(parsed)
			}
		} else if (parsed.d.type === 3) {
			await snow.interaction.createInteractionResponse(parsed.d.id, parsed.d.token, { type: 6 })
			buttons.handle(parsed.d)
		}
	} else if (parsed.t === "USER_UPDATE") {
		sharedUtils.updateUser(parsed.d)
		for (const q of queues.values()) {
			q.listeners.set(parsed.d.id, parsed.d)
			sessions.filter(s => s.guild === q.guildID).forEach(s => s.onListenersUpdate(q.toJSON().members))
		}
	}
}

export function buttonHandlerParamsToInteraction(data: APIMessageComponentInteractionData, user: APIUser): APIMessageComponentInteraction {
	return {
		id: "",
		application_id: confprovider.config.client_id,
		type: 3,
		token: "",
		version: 1,
		locale: "en-US",
		channel: {
			type: 0,
			id: ""
		},
		user,
		channel_id: "",
		data,
		app_permissions: "0",
		message: {
			id: "",
			channel_id: "",
			author: {
				id: confprovider.config.client_id,
				username: "amanda_internal_user",
				discriminator: "0",
				avatar: null,
				global_name: "Amanda"
			},
			content: "",
			timestamp: "",
			edited_timestamp: null,
			tts: false,
			mention_everyone: false,
			mentions: [],
			mention_roles: [],
			attachments: [],
			embeds: [],
			pinned: false,
			type: 0
		}
	}
}
