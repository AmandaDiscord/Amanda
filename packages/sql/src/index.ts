import util = require("util")

import { Pool, QueryConfig, type PoolClient, type QueryResult, type QueryResultRow } from "pg"
import { Bucket, type Counter } from "snowtransfer"

import confprovider = require("@amanda/config")

import { Database, Model, type InferModelDef } from "./orm"


import type { AcceptablePrepared } from "./types"

const models = {
	background_sync: new Model<{ machine_id: string, user_id: string, url: string }>(["machine_id", "user_id"]),
	bank_access: new Model<{ id: string, user_id: string }>(),
	bank_accounts: new Model<{ id: string, amount: string, type: number }>(["id"]),
	bans: new Model<{ user_id: string, temporary: number, expires: number }>(["user_id"]),
	connections: new Model<{ user_id: string, type: "lastfm", access: string }>(["user_id", "type"]),
	couples: new Model<{ user1: string, user2: string, married_at: string, balance: number }>(),
	csrf_tokens: new Model<{ token: string, login_token: string, expires: number }>(["token"]),
	daily_cooldown: new Model<{ user_id: string, last_claim: string }>(["user_id"]),
	interaction_gifs: new Model<{ type: string, url: string }>(),
	lavalink_nodes: new Model<{ host: string, port: number, invidious_origin: string, enabled: number, search_with_invidious: number, name: string }>(["host"]),
	money: new Model<{ user_id: string, coins: string, won_coins: string, lost_coins: string, given_coins: string }>(["user_id"]),
	money_cooldown: new Model<{ user_id: string, command: string, date: number, value: number }>(),
	pending_relations: new Model<{ user1: string, user2: string }>(),
	playlist_songs: new Model<{ playlist_id: number, video_id: string, next: string | null }>(["playlist_id", "video_id"]),
	playlists: new Model<{ playlist_id: number, author: string, name: string, play_count: number }>(["playlist_id"]),
	premium: new Model<{ user_id: string, state: number }>(["user_id"]),
	settings: new Model<{ user_id: string, key: string; value: string; type: "string" | "boolean" | "number" }>(["user_id", "key"]),
	songs: new Model<{ video_id: string, name: string, length: number }>(["video_id"]),
	stat_logs: new Model<{ time: number, id: string, ram_usage_kb: number, users: number, guilds: number, channels: number, voice_connections: number, uptime: number, shard: number }>(["time", "id", "shard"]),
	status_messages: new Model<{ id: number, dates: string, users: string, message: string, type: number, demote: number }>(["id"]),
	status_ranges: new Model<{ label: string, start_month: number, start_day: number, end_month: number, end_day: number }>(["label"]),
	status_users: new Model<{ label: string, user_id: string }>(["label", "user_id"]),
	transactions: new Model<{ id: string, user_id: string, amount: string, mode: number, description: string, target: string, date: string }>(["id"]),
	user_permissions: new Model<{ user_id: string, eval: number, owner: number }>(["user_id"]),
	web_tokens: new Model<{ user_id: string, token: string, staging: number }>(["user_id"])
}

class SequentialCounter implements Counter {
	public readonly id = new Array(3).fill(0).map(() => String.fromCodePoint(Math.floor(Math.random()*26+65))).join("")

	private canGo = true

	public hasReset(): boolean {
		return this.canGo
	}

	public canTake(): boolean {
		return this.canGo
	}

	public take(): boolean {
		if (!this.canGo) return false
		this.canGo = false
		return true
	}

	public timeUntilReset(): number {
		return 10
	}

	public responseReceived(): void {
		this.canGo = true
	}

	public applyCount(limit: number | null, remaining: number, resetAfter: number): void { void 0 }
}

/**
 * Wrapper around the postgres lib with strong types and special handling
 */
class SQLProvider {
	/** The backing pg pool */
	public static pool: Pool | null = null
	/** The backing pg ppol client */
	public static poolClient: PoolClient | null = null
	/** A custom Object Relational Mapper with types for our tables */
	public static readonly orm = new Database(models, SQLProvider)

	private static readonly bucket = new Bucket([new SequentialCounter()])

	/**
	 * Execute a statement and return all of the matching rows
	 */
	public static async all<T extends QueryResultRow | keyof typeof models>(
		statement: string,
		prepared?: Array<AcceptablePrepared>
	): Promise<Array<T extends keyof typeof models ? InferModelDef<(typeof models)[T]> : T>> {
		const result = await SQLProvider.raw<T>(statement, prepared)
		return result?.rows ?? []
	}

	/**
	 * Execute a statement and return the first matching row. Usually for SELECT
	 */
	public static async get<T extends QueryResultRow | keyof typeof models>(
		statement: string,
		prepared?: Array<AcceptablePrepared>): Promise<(T extends keyof typeof models ? InferModelDef<(typeof models)[T]> : T) | null> {
		const result = await SQLProvider.raw<T>(statement, prepared)
		return result?.rows?.[0] ?? null
	}

	/**
	 * Execute a statement and return the raw query result
	 */
	public static raw<T extends QueryResultRow | keyof typeof models>(
		statement: string,
		prepared?: Array<AcceptablePrepared>,
		attempts = 2,
		bypassBucket = false
	): Promise<QueryResult<T extends keyof typeof models ? InferModelDef<(typeof models)[T]> : T> | null> {
		if (!SQLProvider.poolClient || !confprovider.config.db_enabled) return Promise.resolve(null)
		let prep: Array<AcceptablePrepared>

		if (prepared && typeof (prepared) != "object") prep = [prepared]
		else if (prepared && Array.isArray(prepared)) prep = prepared

		return new Promise((resolve, reject) => {
			if (Array.isArray(prepared) && (prepared as unknown as Array<undefined>).includes(void 0)) {
				return reject(new Error(`Prepared statement includes undefined\n	Query: ${statement}\n	Prepared: ${util.inspect(prepared)}`))
			}

			const fn = async () => {
				const query: QueryConfig = { text: statement, values: prep }
				SQLProvider.poolClient!.query(Array.isArray(prep) ? query : query.text).then(resolve).catch(err => {
					console.error(err)
					attempts--
					console.warn(`${statement}\n${String(prepared)}`)
					if (attempts) return SQLProvider.raw<T>(statement, prep, attempts, true).then(resolve).catch(reject)
					else return reject(err as Error)
				}).finally(() => this.bucket.counters[0].responseReceived())
			}

			if (bypassBucket) fn()
			else this.bucket.enqueue(fn)
		})
	}

	/**
	 * Internal method that gets called when the config file changes
	 */
	public static onConfigChange(): void {
		if (confprovider.config.db_enabled && !SQLProvider.pool) SQLProvider.connect()
		else if (!confprovider.config.db_enabled && SQLProvider.pool) SQLProvider.disconnect()
	}

	/**
	 * Initiate the connection of the SQLProvider
	 */
	public static async connect(): Promise<void> {
		if (!confprovider.config.db_enabled) return

		if (SQLProvider.pool) await SQLProvider.disconnect()

		const pool = new Pool({
			host: confprovider.config.sql_domain,
			user: confprovider.config.sql_user,
			password: confprovider.config.sql_password,
			database: "main",
			max: 2
		})

		const db = await pool.connect()
			.catch(e => void console.error(e))
		if (!db) return

		try {
			await db.query({ text: "SELECT * FROM premium LIMIT 1" })
		} catch {
			return
		}

		pool.once("error", SQLProvider._onError)

		console.log("Connected to database")
		SQLProvider.pool = pool
		SQLProvider.poolClient = db
	}

	/**
	 * Destroy the connection of the SQLProvider
	 */
	public static async disconnect(): Promise<void> {
		if (!SQLProvider.pool) return
		SQLProvider.pool.removeListener("error", SQLProvider._onError)
		await SQLProvider.pool.end()
			.then(() => console.warn("Database disabled"))
			.catch(console.error)
		SQLProvider.pool = null
		SQLProvider.poolClient = null
	}

	/**
	 * Amanda handles query errors as best as she can. If an error occurs, we can mostly assume
	 * that the error is related to the connection dropping
	 */
	private static _onError(): void {
		setTimeout(() => {
			SQLProvider.disconnect().then(() => SQLProvider.connect())
		}, 5000)
	}
}

confprovider.addCallback(SQLProvider.onConfigChange)

export = SQLProvider
