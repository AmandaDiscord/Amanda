import util = require("util")

import { Pool } from "pg"
import type { PoolClient, QueryResult, QueryResultRow } from "pg"

import type ConfigProvider = require("@amanda/config")

import { Database, Model } from "./orm"


import type { AcceptablePrepared } from "./types"

const models = {
	bank_access: new Model<{ id: string, user_id: string }>(),
	bank_accounts: new Model<{ id: string, amount: string, type: number }>(["id"]),
	bans: new Model<{ user_id: string, temporary: number, expires: number }>(["user_id"]),
	couples: new Model<{ user1: string, user2: string, married_at: string, balance: number }>(),
	csrf_tokens: new Model<{ token: string, login_token: string, expires: number }>(["token"]),
	daily_cooldown: new Model<{ user_id: string, last_claim: number }>(["user_id"]),
	interaction_gifs: new Model<{ type: string, url: string }>(),
	lavalink_node_regions: new Model<{ host: string, region: string }>(["host", "region"]),
	lavalink_nodes: new Model<{ host: string, port: number, invidious_origin: string, enabled: number, search_with_invidious: number, name: string }>(["host"]),
	money: new Model<{ user_id: string, coins: string, won_coins: string, lost_coins: string, given_coins: string }>(["user_id"]),
	money_cooldown: new Model<{ user_id: string, command: string, date: number, value: number }>(),
	pending_relations: new Model<{ user1: string, user2: string }>(),
	playlist_songs: new Model<{ playlist_id: number, video_id: string, next: string | null }>(["playlist_id", "video_id"]),
	playlists: new Model<{ playlist_id: number, author: string, name: string, play_count: number }>(["playlist_id"]),
	premium: new Model<{ user_id: string, state: number }>(["user_id"]),
	songs: new Model<{ video_id: string, name: string, length: number }>(["video_id"]),
	stat_logs: new Model<{ time: number, id: string, ram_usage_kb: number, users: number, guilds: number, channels: number, voice_connections: number, uptime: number, shard: number }>(["time", "id", "shard"]),
	transactions: new Model<{ id: string, user_id: string, amount: string, mode: number, description: string, target: string, date: string }>(["id"]),
	users: new Model<{ id: string, tag: string, avatar: string | null, bot: number, added_by: string }>(["id"], { useBuffer: true }),
	web_tokens: new Model<{ user_id: string, token: string, staging: number }>(["user_id"]),
	connections: new Model<{ user_id: string, type: "lastfm", access: string }>(["user_id", "type"])
}

class SQLProvider {
	public pool: Pool | null = null
	public poolClient: PoolClient | null = null
	public orm: Database<typeof models>

	public constructor(public confprovider: ConfigProvider) {
		this.orm = new Database(models, this)
		confprovider.addCallback(this.onConfigChange.bind(this))
	}

	public async all<T extends QueryResultRow>(statement: string, prepared?: Array<AcceptablePrepared>): Promise<Array<T>> {
		const result = await this.raw<T>(statement, prepared)
		return result?.rows ?? []
	}

	public async get<T extends QueryResultRow>(statement: string, prepared?: Array<AcceptablePrepared>): Promise<T | null> {
		const result = await this.raw<T>(statement, prepared)
		return result?.rows?.[0] ?? null
	}

	public raw<T extends QueryResultRow>(statement: string, prepared?: Array<AcceptablePrepared>, attempts = 2): Promise<QueryResult<T> | null> {
		let prep: Array<AcceptablePrepared>

		if (prepared !== undefined && typeof (prepared) != "object") prep = [prepared]
		else if (prepared !== undefined && Array.isArray(prepared)) prep = prepared

		return new Promise((resolve, reject) => {
			if (Array.isArray(prepared) && (prepared as unknown as Array<undefined>).includes(undefined)) {
				return reject(new Error(`Prepared statement includes undefined\n	Query: ${statement}\n	Prepared: ${util.inspect(prepared)}`))
			}

			const query = { text: statement, values: prep }
			if (!this.poolClient || !this.confprovider.config.db_enabled) return resolve(null)
			this.poolClient.query(Array.isArray(prep) ? query : query.text).then(resolve).catch(err => {
				console.error(err)
				attempts--
				console.warn(`${statement}\n${String(prepared)}`)
				if (attempts) this.raw<T>(statement, prep, attempts).then(resolve).catch(reject)
				else reject(err)
			})
		})
	}

	private onConfigChange(): void {
		if (this.confprovider.config.db_enabled && !this.pool) this.connect().catch(console.error)
		else if (!this.confprovider.config.db_enabled && this.pool) this.disconnect().catch(console.error)
	}

	public async connect(): Promise<void> {
		if (!this.confprovider.config.db_enabled) return

		const pool = new Pool({
			host: this.confprovider.config.sql_domain,
			user: this.confprovider.config.sql_user,
			password: this.confprovider.config.sql_password,
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
		this.pool = pool
		this.poolClient = db
	}

	public async disconnect(): Promise<void> {
		if (!this.pool) return
		await this.pool.end()
			.then(() => console.warn("Database disabled"))
			.catch(console.error)
		this.pool = null
		this.poolClient = null
	}
}

export = SQLProvider
