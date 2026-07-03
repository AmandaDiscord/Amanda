import fs = require("node:fs")
import p = require("node:path")
import nodeCrypto = require("node:crypto")

import mime = require("mime-types")

import buttons = require("@amanda/buttons")
import sql = require("@amanda/sql")

import passthrough = require("./passthrough")
const { rootFolder, confprovider, lavalink, commands, snow, commandWorkers, queues, gatewayShardIndex, sync } = passthrough

const sharedUtils = sync.require("@amanda/shared-utils") as typeof import("@amanda/shared-utils")
const autocomplete = sync.require("./autocomplete") as typeof import("./autocomplete")

import type { HttpResponse, WebSocket as UWS } from "uWebSockets.js"
import type { Readable } from "node:stream"
import type { IGatewayMessage } from "cloudstorm"
import {
	type APIUser,
	type APIMessageComponentInteractionData,
	type APIMessageComponentInteraction,
	type APIChatInputApplicationCommandInteraction,
	type APIApplicationCommandAutocompleteInteraction,

	Locale,
	APIInteraction
} from "discord-api-types/v10"


const commaRegex = /,/g
const slashSingleRegex = /\//
const toEndOfSemiRegex = /([^;]+);?/

export function toArrayBuffer(buffer: Buffer): ArrayBuffer {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

export function onAbortedOrFinishedResponseStream(res: HttpResponse, readStream: Readable): void {
	if (res.id !== -1) readStream.destroy()
	res.id = -1
}

export function streamResponse(res: HttpResponse, readStream: Readable, totalSize: number): Promise<void> {
	let resolveOuter: (value: void) => void
	let cancel = false
	const onAbort = () => {
		onAbortedOrFinishedResponseStream(res, readStream)
		if (resolveOuter) resolveOuter()
		else cancel = true
	}
	attachResponseAbortListener(res, onAbort)
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

export function attachResponseAbortListener(res: HttpResponse, callback?: () => unknown): void {
	if (res.alreadyAborted) return void callback?.()

	if (res.abortListeners) res.abortListeners.push(callback)
	else {
		res.continue = true
		res.abortListeners = []
		res.onAborted(() => {
			res.continue = false
			for (const cb of res.abortListeners) {
				cb()
				res.abortListeners = undefined
				res.alreadyAborted = true
			}
		})
	}
}

export async function streamFile(path: string, res: HttpResponse, acceptHead?: string | undefined, ifModifiedSinceHeader?: string | undefined, headersOnly = false, status = 200, cameFrom404 = false): Promise<void> {
	attachResponseAbortListener(res)
	let stats: import("node:fs").Stats
	const joined = p.join(rootFolder, path)
	if (!joined.startsWith(rootFolder)) return streamFile("404.html", res, acceptHead, ifModifiedSinceHeader, headersOnly, 404, true)

	try {
		stats = await fs.promises.stat(joined)
		if (!res.continue) return
	} catch {
		console.log(`404 ${path}`)
		if (!res.continue) return
		if (cameFrom404) {
			let written = false
			return void res.cork(() => {
				if (written) return
				written = true
				res.writeStatus("404").endWithoutBody()
			})
		} else return streamFile("404.html", res, acceptHead, ifModifiedSinceHeader, headersOnly, 404, true)
	}

	if (!stats.isFile()) {
		if (cameFrom404) {
			let written = false
			return void res.cork(() => {
				if (written) return
				written = true
				res.writeStatus("404").endWithoutBody()
			})
		} else return streamFile("404.html", res, acceptHead, ifModifiedSinceHeader, headersOnly, 404, true)
	}

	if (stats.size === 0) {
		let written = false
		return void res.cork(() => {
			if (written) return
			written = true
			res.writeStatus("204").endWithoutBody()
		})
	}

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
	if (!canAccept) {
		let written = false
		return void res.cork(() => {
			if (written) return
			written = true
			res.writeStatus("406").endWithoutBody()
		})
	}
	if (!cameFrom404 && ifModifiedSinceHeader) { // check modified header(s)
		if (sharedUtils.checkDateHeader(ifModifiedSinceHeader)) {
			const expecting = new Date(ifModifiedSinceHeader)
			if (stats.mtimeMs >= expecting.getTime()) {
				status = 304
				headersOnly = true
			}
		}
	}
	let written = false
	res.cork(() => {
		if (written) return
		written = true
		res.writeStatus(String(status))
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
	let written = false
	res.cork(() => {
		if (written) return
		written = true
		res
			.writeStatus("303")
			.writeHeader("Location", location)
			.writeHeader("Content-Type", "text/html")
			.end(bod)
	})
}

export function generateCSRF(loginToken: string | null = null) {
	const token = nodeCrypto.randomBytes(32).toString("hex")
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
		attachResponseAbortListener(res, () => rej(new Error("ABORTED")))
	})
}

type State = object

export class Validator<S extends State, P> {
	public readonly state = {} as S
	// @ts-expect-error
	public previousValue: P
	public readonly operations: Array<{ expected: unknown, assign: string | undefined, errorValue: [number, string] | undefined, code: (state: S, previousValue: P) => unknown }> = []
	public stage = 0
	public promise: Promise<S> | undefined

	public do<C extends (state: S, previousValue: P) => unknown, A extends undefined>(code: C, expected?: ((value: Awaited<ReturnType<C>>) => boolean) | Awaited<ReturnType<C>> | undefined, errorValue?: [number, string] | undefined, assign?: A): Validator<S, Awaited<ReturnType<C>>>
	public do<C extends (state: S, previousValue: P) => unknown, A extends string>(code: C, expected?: ((value: Awaited<ReturnType<C>>) => boolean) | Awaited<ReturnType<C>> | undefined, errorValue?: [number, string] | undefined, assign?: A): Validator<S & { [K in A]: Awaited<ReturnType<C>> }, Awaited<ReturnType<C>>>
	public do<C extends(state: S, previousValue: P) => unknown, A extends string | undefined>(code: C, expected?: ((value: Awaited<ReturnType<C>>) => boolean) | Awaited<ReturnType<C>> | undefined, errorValue?: [number, string] | undefined, assign?: A): this {
		this.operations.push({ expected, assign, errorValue, code })
		return this
	}

	public go(): Promise<S> {
		this.promise ??= new Promise<S>((resolve, reject) => setImmediate(() => void this._next(resolve, reject)))
		return this.promise
	}

	private async _next(resolve: (value: S | PromiseLike<S>) => void, reject: (reason?: [number, string]) => void): Promise<void> {
		if (this.operations.length === 0) return resolve(this.state)

		this.stage++
		const input = this.operations.shift()
		if (!input) return reject([500, "NO_INPUT"])

		const processSuccess = async (result: unknown) => {
			if (input.expected && (typeof input.expected === "function" ? !input.expected(result) : input.expected !== result)) return processError()
			// @ts-expect-error They are assignable
			if (input.assign) this.state[input.assign as keyof S] = result
			this.previousValue = result as P
			await this._next(resolve, reject)
		}

		const processError = () => {
			if (input.errorValue) reject(input.errorValue)
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
		if (!Array.isArray(list)) list = [list]
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

export function onGatewayMessage(
	ws: UWS<{ worker: import("./ws/gateway").GatewayWorker; clusterID: string }>,
	message: ArrayBuffer
) {
	const parsed: IGatewayMessage & { cluster_id: string } = JSON.parse(Buffer.from(message).toString())
	const wsData = ws.getUserData()
	parsed.cluster_id = wsData.clusterID

	switch (parsed.t) {
	// @ts-expect-error Custom Event
	case "SHARD_LIST":
		wsData.worker.shards.forEach(s => {
			gatewayShardIndex.delete(s)
			wsData.worker.shards.delete(s)
		})
		// @ts-expect-error Custom Event
		parsed.d.forEach((sid: number) => {
			gatewayShardIndex.set(sid, wsData.worker.clusterID)
			wsData.worker.shards.add(sid)
		})
		break

	case "VOICE_STATE_UPDATE":
		if (!parsed.d.guild_id) return
		lavalink.voiceStateUpdate(parsed.d)
		queues.get(parsed.d.guild_id)?.voiceStateUpdate(parsed.d)
		break

	case "VOICE_SERVER_UPDATE":
		lavalink.voiceServerUpdate(parsed.d)
		break

	case "INTERACTION_CREATE": {
		handleInteraction(parsed.d).catch(console.error)
		break
	}

	case "USER_UPDATE":
		sharedUtils.updateUser(parsed.d)
		updateUserInAllQueues(parsed.d)
		break
	}
}

export async function handleInteraction(payload: APIInteraction): Promise<void>
// eslint-disable-next-line no-redeclare
export async function handleInteraction(payload: APIInteraction, returnJSON: true): Promise<string>
// eslint-disable-next-line no-redeclare
export async function handleInteraction(payload: APIInteraction, returnJSON: false): Promise<void>
// eslint-disable-next-line no-redeclare
export async function handleInteraction(payload: APIInteraction, returnJSON = false): Promise<string | void> {
	let commandHandled = false
	let rt = "{}"

	const user = payload.member?.user ?? payload.user!
	sharedUtils.updateUser(user)
	updateUserInAllQueues(user)

	switch (payload.type) {
	case 1: // Pings to verify
		rt = "{\"type\":1}"
		commandHandled = true
		break

	case 2: // Commands
		rt = "{\"type\":5}"
		if (commands.handle(payload as APIChatInputApplicationCommandInteraction, returnJSON ? void 0 : () => snow.interaction.createInteractionResponse(payload.id, payload.token, { type: 5 }))) commandHandled = true
		break

	case 3: // Buttons
		rt = "{\"type\":6}"
		if (!returnJSON) await snow.interaction.createInteractionResponse(payload.id, payload.token, { type: 6 })
		buttons.handle(payload)
		commandHandled = true
		break

	case 4: { // Autocomplete. Cannot be deferred and expects a response within 3 seconds, so the choices are awaited
		const handler = autocomplete.handlers.get((payload as APIApplicationCommandAutocompleteInteraction).data.name)
		const choices = handler
			? await handler(payload as APIApplicationCommandAutocompleteInteraction).catch(() => [])
			: []

		rt = JSON.stringify({ type: 8, data: { choices } })
		if (!returnJSON) await snow.interaction.createInteractionResponse(payload.id, payload.token, { type: 8, data: { choices } })
		commandHandled = true
		break
	}

	default:
		console.error(`Unknown payload type ${payload.type}\n`, payload)
		break
	}

	if (!commandHandled) {
		if (!commandWorkers.length) throw new Error("NO_WORKERS")
		const worker = sharedUtils.arrayRandom(commandWorkers)
		worker.send({
			op: 0,
			t: "INTERACTION_CREATE",
			d: payload
		})
	}

	if (returnJSON) return rt
}

export function updateUserInAllQueues(user: APIUser) {
	for (const q of queues.values()) {
		if (!q.listeners.has(user.id)) continue
		q.listeners.set(user.id, user)
		q.sendToSubscribedSessions("onListenersUpdate", q.toJSON().members)
	}
}

export function buttonHandlerParamsToInteraction(data: APIMessageComponentInteractionData, user: APIUser): APIMessageComponentInteraction {
	return {
		id: "",
		application_id: confprovider.config.client_id,
		type: 3,
		token: "",
		version: 1,
		locale: Locale.EnglishUS,
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
				global_name: "Amanda Internal User"
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
		},
		entitlements: [],
		authorizing_integration_owners: {
			0: "",
			1: ""
		},
		attachment_size_limit: 1024 * 1024 * 1024 * 10 // 10MB
	}
}
