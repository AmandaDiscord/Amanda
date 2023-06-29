import util = require("util")

import { Pool } from "pg"
import type { PoolClient, QueryResult, QueryResultRow } from "pg"

import confprovider = require("@amanda/config")

import { Database, Model, InferModelDef } from "./orm"


import type { AcceptablePrepared } from "./types"

const models = {
	background_sync: new Model<{ machine_id: string, user_id: string, url: string }>(["machine_id", "user_id"]),
	bank_access: new Model<{ id: string, user_id: string }>(),
	bank_accounts: new Model<{ id: string, amount: string, type: number }>(["id"]),
	bans: new Model<{ user_id: string, temporary: number, expires: number }>(["user_id"]),
	connections: new Model<{ user_id: string, type: "lastfm", access: string }>(["user_id", "type"]),
	couples: new Model<{ user1: string, user2: string, married_at: string, balance: number }>(),
	csrf_tokens: new Model<{ token: string, login_token: string, expires: number }>(["token"]),
	daily_cooldown: new Model<{ user_id: string, last_claim: number }>(["user_id"]),
	gateway_clusters: new Model<{ cluster_id: string, url: string }>(["cluster_id"]),
	guilds: new Model<{ guild_id: string, client_id: string, cluster_id: string, shard_id: number }>(["client_id", "guild_id"]),
	interaction_gifs: new Model<{ type: string, url: string }>(),
	lavalink_node_regions: new Model<{ host: string, region: string }>(["host", "region"]),
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
	users: new Model<{ id: string, tag: string, avatar: string | null, bot: number, added_by: string }>(["id"], { useBuffer: true }),
	voice_states: new Model<{ guild_id: string, channel_id: string, user_id: string }>(["user_id", "guild_id"], { useBuffer: true, bufferSize: 300 }),
	web_tokens: new Model<{ user_id: string, token: string, staging: number }>(["user_id"])
}

class SQLProvider {
	public static pool: Pool | null = null
	public static poolClient: PoolClient | null = null
	public static orm = new Database(models, SQLProvider)

	public static async all<T extends QueryResultRow | keyof typeof models>(
		statement: string,
		prepared?: Array<AcceptablePrepared>
	): Promise<Array<T extends keyof typeof models ? InferModelDef<(typeof models)[T]> : T>> {
		const result = await SQLProvider.raw<T>(statement, prepared)
		return result?.rows ?? []
	}

	public static async get<T extends QueryResultRow | keyof typeof models>(
		statement: string,
		prepared?: Array<AcceptablePrepared>): Promise<(T extends keyof typeof models ? InferModelDef<(typeof models)[T]> : T) | null> {
		const result = await SQLProvider.raw<T>(statement, prepared)
		return result?.rows?.[0] ?? null
	}

	public static raw<T extends QueryResultRow | keyof typeof models>(
		statement: string,
		prepared?: Array<AcceptablePrepared>,
		attempts = 2
	): Promise<QueryResult<T extends keyof typeof models ? InferModelDef<(typeof models)[T]> : T> | null> {
		let prep: Array<AcceptablePrepared>

		if (prepared !== void 0 && typeof (prepared) != "object") prep = [prepared]
		else if (prepared !== void 0 && Array.isArray(prepared)) prep = prepared

		return new Promise((resolve, reject) => {
			if (Array.isArray(prepared) && (prepared as unknown as Array<undefined>).includes(void 0)) {
				return reject(new Error(`Prepared statement includes undefined\n	Query: ${statement}\n	Prepared: ${util.inspect(prepared)}`))
			}

			const query = { text: statement, values: prep }
			if (!SQLProvider.poolClient || !confprovider.config.db_enabled) return resolve(null)
			SQLProvider.poolClient.query(Array.isArray(prep) ? query : query.text).then(resolve).catch(err => {
				console.error(err)
				attempts--
				console.warn(`${statement}\n${String(prepared)}`)
				if (attempts) SQLProvider.raw<T>(statement, prep, attempts).then(resolve).catch(reject)
				else reject(err)
			})
		})
	}

	public static onConfigChange(): void {
		if (confprovider.config.db_enabled && !SQLProvider.pool) SQLProvider.connect().catch(console.error)
		else if (!confprovider.config.db_enabled && SQLProvider.pool) SQLProvider.disconnect().catch(console.error)
	}

	public static async connect(): Promise<void> {
		if (!confprovider.config.db_enabled) return

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

		console.log("Connected to database")
		SQLProvider.pool = pool
		SQLProvider.poolClient = db
	}

	public static async disconnect(): Promise<void> {
		if (!SQLProvider.pool) return
		await SQLProvider.pool.end()
			.then(() => console.warn("Database disabled"))
			.catch(console.error)
		SQLProvider.pool = null
		SQLProvider.poolClient = null
	}
}

confprovider.addCallback(SQLProvider.onConfigChange.bind(SQLProvider))

export = SQLProvider
