/**
 * This is a bare bones version of an ORM which is modeled to cover most or all of Amanda's database structure.
 * Very complex statements will be impossible with this.
 * Optimization is top priority.
 */

import passthrough from "../passthrough"
const { sync } = passthrough

const sql = sync.require("./sql") as typeof import("./sql")

type StatementBuffer = {
	timeouts: {
		insert: NodeJS.Timeout | null
	}
	bufferValues: {
		insert: Array<Record<string, unknown>>
	}
}

type InferModelDef<M extends Model<Record<string, unknown>>> = M extends Model<infer D> ? D : unknown

export class Model<D extends Record<string, unknown>> {
	public primaryKey: Array<keyof D>
	public options: { useBuffer: boolean; bufferSize: number; bufferTimeout: number }

	public constructor(primaryKey: Array<keyof D> = [], options: { useBuffer?: boolean; bufferSize?: number; bufferTimeout?: number } = {}) {
		this.primaryKey = primaryKey || []
		this.options = Object.assign({ useBuffer: false, bufferSize: 50, bufferTimeout: 5000 }, options)
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Database<M extends Record<string, Model<any>>> {
	public tables: M
	public buffers: Record<string, StatementBuffer> = {}

	public constructor(models: M) {
		this.tables = models

		for (const table of Object.keys(this.tables)) {
			this.buffers[table] = { bufferValues: { insert: [] }, timeouts: { insert: null } }
		}
	}

	public raw(statement: string, prepared?: Array<unknown>) {
		return sql.all(statement, prepared)
	}

	public upsert<T extends keyof M>(table: T, properties: Partial<InferModelDef<M[T]>>, options: { useBuffer?: boolean } = {}) {
		const opts = Object.assign({ useBuffer: this.tables[table].options.useBuffer }, options)
		return this._in(table, properties, opts, "upsert")
	}

	public insert<T extends keyof M>(table: T, properties: Partial<InferModelDef<M[T]>>, options: { useBuffer?: boolean } = {}) {
		const opts = Object.assign({ useBuffer: this.tables[table].options.useBuffer }, options)
		return this._in(table, properties, opts, "insert")
	}

	private _in<T extends keyof M>(table: T, properties: Partial<InferModelDef<M[T]>>, options: { useBuffer?: boolean }, method: "insert" | "upsert") {
		return new Promise((r, rej) => {
			let res: ReturnType<typeof Database["prototype"]["_buildStatement"]>
			if (options.useBuffer) {
				const model = this.tables[table]
				if (this.buffers[table as string].bufferValues.insert.length === model.options.bufferSize) {
					const timeout = this.buffers[table as string].timeouts.insert
					if (timeout) clearTimeout(timeout)
					this.buffers[table as string].timeouts.insert = null
					res = this._buildStatement(method, table, properties, { useBuffer: true })
				} else {
					this.buffers[table as string].bufferValues.insert.push(properties)
					if (!this.buffers[table as string].timeouts.insert) {
						this.buffers[table as string].timeouts.insert = setTimeout(() => {
							const res2 = this._buildStatement(method, table, undefined, { useBuffer: true })
							r(sql.all(res2.statement, res2.prepared).catch(rej))
							this.buffers[table as string].timeouts.insert = null
						}, model.options.bufferTimeout)
					}
					return
				}
			} else res = this._buildStatement(method, table, properties)
			return r(sql.all(res.statement, res.prepared).catch(rej))
		})
	}

	public update<T extends keyof M>(table: T, set: Partial<InferModelDef<M[T]>>, where: Partial<InferModelDef<M[T]>> | undefined = undefined) {
		const options = {}
		if (where) Object.assign(options, { where: where })
		const res = this._buildStatement("update", table, set, options)
		return sql.all(res.statement, res.prepared)
	}

	public select<T extends keyof M>(table: T, where: Partial<InferModelDef<M[T]>> | undefined = undefined, options: { select?: Array<keyof InferModelDef<M[T]>>; limit?: number; order?: keyof InferModelDef<M[T]>; orderDescending?: boolean; } = {}): Promise<Array<InferModelDef<M[T]>>> {
		const res = this._buildStatement("select", table, where, options)
		return sql.all(res.statement, res.prepared) as Promise<Array<InferModelDef<M[T]>>>
	}

	public get<T extends keyof M>(table: T, where: Partial<InferModelDef<M[T]>> | undefined = undefined, options: { select?: Array<keyof InferModelDef<M[T]>>; order?: keyof InferModelDef<M[T]>; orderDescending?: boolean; } = {}): Promise<InferModelDef<M[T]>> {
		const opts = Object.assign(options, { limit: 1 })
		const res = this._buildStatement("select", table, where, opts)
		return sql.get(res.statement, res.prepared) as Promise<InferModelDef<M[T]>>
	}

	public delete<T extends keyof M>(table: T, where: Partial<InferModelDef<M[T]>> | undefined = undefined) {
		const res = this._buildStatement("delete", table, where)
		return sql.all(res.statement, res.prepared)
	}

	private _buildStatement<T extends keyof M>(method: "select" | "upsert" | "insert" | "update" | "delete", table: T, properties: Partial<InferModelDef<M[T]>> | undefined = undefined, options: { select?: Array<keyof Partial<InferModelDef<M[T]>> | "*">; limit?: number; useBuffer?: boolean; where?: Partial<InferModelDef<M[T]>>; order?: keyof InferModelDef<M[T]>; orderDescending?: boolean; } = {}) {
		options = Object.assign({ select: ["*"], limit: 0, useBuffer: false, where: {} }, options)
		const model = this.tables[table] as unknown as Model<InferModelDef<M[T]>>
		let statement = ""
		let preparedAmount = 1
		const prepared = [] as Array<unknown>
		const props = properties ? Object.keys(properties) : []

		const mapped = (!["insert", "upsert"].includes(method)) ? props.map(key => { // insert and upsert maps the prepared indexes. Doing so now would break their indexes.
			const value = properties?.[key]
			if (value === null) return `${key} ${method === "update" ? "=" : "IS"} NULL`
			const previous = prepared.indexOf(value)
			const index = (previous !== -1) ? previous + 1 : preparedAmount++
			if (previous === -1) prepared.push(value)
			return `${key} = $${index}`
		}) : []

		if (method === "select") {
			statement += `SELECT ${options.select?.join(", ") || "*"} FROM ${table}`
			if (properties) {
				statement += " WHERE "
				statement += mapped.join(" AND ")
			}

			if (options.order !== undefined) statement += ` ORDER BY ${options.order}`
			if (options.orderDescending) statement += " DESC"
			if (options.limit !== undefined && options.limit !== 0) statement += ` LIMIT ${options.limit}`

		} else if (method === "update") {
			statement += `UPDATE ${table} SET `
			statement += mapped.join(", ")
			if (options.where) {
				const where = Object.keys(options.where).map(key => {
					const value = options.where?.[key]
					if (value === null) return `${key} IS NULL`
					const previous = prepared.indexOf(value)
					const index = (previous !== -1) ? previous + 1 : preparedAmount++
					if (previous === -1) prepared.push(value)
					return `${key} = $${index}`
				})
				if (where.length) statement += ` WHERE ${where.join(" AND ")}`
				else throw new Error("Potentially destructive UPDATE statement. Use raw sql instead")
			} else throw new Error("Potentially destructive UPDATE statement. Use raw sql instead")

		} else if (method === "insert" || method === "upsert") {
			statement += `INSERT INTO ${table}`
			if (options.useBuffer) {
				const name = table as string
				const buffer = this.buffers[name].bufferValues.insert
				// Get all distinct columns from all entries
				const distinct = buffer.map(i => Object.keys(i)).flat().filter((val, ind, arr) => arr.indexOf(val) === ind)
				const values = [] as Array<string>
				const addedRows = [] as Array<Record<string, unknown>>
				for (const entry of buffer) {
					const existingEntry = addedRows.find(i => model.primaryKey.length && model.primaryKey.every(k => entry[k as string] === i[k as string]))
					if (model.primaryKey.length && existingEntry) continue
					addedRows.push(entry)
					values.push(Object.keys(entry).map(key => {
						// If statements in the buffer don't share the same
						if (!distinct.includes(key)) return "DEFAULT"
						const value = entry[key]
						if (value === null) return "NULL"
						const previous = prepared.indexOf(value)
						const index = (previous !== -1) ? previous + 1 : preparedAmount++
						if (previous === -1) prepared.push(value)
						return `$${index}`
					}).join(", "))
				}
				statement += ` (${distinct.join(", ")}) VALUES ${values.map(i => `(${i})`).join(", ")}`
				if (method === "insert") buffer.length = 0
			} else {
				const columns = [] as Array<string>
				const values = [] as Array<unknown>
				for (const key of props) {
					const value = properties?.[key]
					columns.push(key)
					values.push(`$${preparedAmount++}`)
					prepared.push(value)
				}
				statement += ` (${columns.join(", ")}) VALUES (${values.join(", ")})`
			}
			if (method === "upsert" && model.primaryKey.length) {
				let props2 = props
				if (options.useBuffer) {
					const name = table as string
					const buffer = this.buffers[name].bufferValues.insert
					// Get all distinct columns from all entries
					const distinct = buffer.map(i => Object.keys(i)).flat().filter((val, ind, arr) => arr.indexOf(val) === ind)
					props2 = distinct
					buffer.length = 0
				}
				const nonPrimaryColumns = props2.filter(column => !model.primaryKey.includes(column))
				statement += ` ON CONFLICT (${model.primaryKey.join(", ")}) DO ${nonPrimaryColumns.length ? `UPDATE SET ${nonPrimaryColumns.map(column => `${column} = excluded.${column}`).join(", ")}` : "NOTHING"}`
			}

		} else if (method === "delete") {
			statement += `DELETE FROM ${table}`
			if (properties) statement += ` WHERE ${mapped.join(" AND ")}`
		}

		return { statement: statement, prepared: prepared }
	}
}

export const db = new Database({
	account_prefixes: new Model<{ user_id: string; prefix: string; status: number; }>(["user_id", "prefix"]),
	background_sync: new Model<{ machine_id: string, user_id: string, url: string }>(["machine_id", "user_id"], { useBuffer: true, bufferTimeout: 2000 }),
	bank_access: new Model<{ id: string, user_id: string }>(),
	bank_accounts: new Model<{ id: string, amount: string, type: number }>(["id"]),
	bans: new Model<{ user_id: string, temporary: number, expires: number }>(["user_id"]),
	channel_overrides: new Model<{ id: string, type: number, allow: string, deny: string, guild_id: string, channel_id: string }>(["channel_id", "id"], { useBuffer: true, bufferSize: 5000 }),
	channels: new Model<{ id: string, type: number, guild_id: string, name: string, rtc_region: string }>(["id"], { useBuffer: true, bufferSize: 5000 }),
	couples: new Model<{ user1: string, user2: string, married_at: string, balance: number }>(),
	csrf_tokens: new Model<{ token: string, login_token: string, expires: number }>(["token"]),
	daily_cooldown: new Model<{ user_id: string, last_claim: number }>(["user_id"]),
	guilds: new Model<{ id: string, name: string, icon: string, member_count: number, owner_id: string, added_by: string }>(["id"], { useBuffer: true, bufferSize: 1000 }),
	interaction_gifs: new Model<{ type: string, url: string }>(),
	lavalink_node_regions: new Model<{ host: string, region: string }>(["host", "region"]),
	lavalink_nodes: new Model<{ host: string, port: number, invidious_origin: string, enabled: number, search_with_invidious: number, name: string }>(["host"]),
	member_roles: new Model<{ id: string, guild_id: string, role_id: string }>(["guild_id", "id", "role_id"], { useBuffer: true }),
	members: new Model<{ id: string, guild_id: string, nick: string, joined_at: string }>(["id", "guild_id"]),
	money: new Model<{ user_id: string, coins: string }>(["user_id"]),
	money_cooldown: new Model<{ user_id: string, command: string, date: number, value: number }>(),
	pending_relations: new Model<{ user1: string, user2: string }>(),
	periodic_history: new Model<{ field: string, timestamp: number }>(),
	playlist_songs: new Model<{ playlist_id: number, video_id: string, next: string }>(["playlist_id", "video_id"]),
	playlists: new Model<{ playlist_id: number, author: string, name: string, play_count: number }>(["playlist_id"]),
	premium: new Model<{ user_id: string, state: number }>(["user_id"]),
	restart_notify: new Model<{ bot_id: string, mention_id: string, channel_id: string }>(["bot_id", "mention_id"]),
	roles: new Model<{ id: string, permissions: string, guild_id: string }>(["id"], { useBuffer: true, bufferSize: 5000 }),
	settings_guild: new Model<{ key_id: string, setting: string, value: string }>(["key_id", "setting"]),
	settings_self: new Model<{ key_id: string, setting: string, value: string }>(["key_id", "setting"]),
	songs: new Model<{ video_id: string, name: string, length: number }>(["video_id"]),
	stat_logs: new Model<{ time: number, id: string, ram_usage_kb: number, users: number, guilds: number, channels: number, voice_connections: number, uptime: number, shard: number }>(["time", "id", "shard"]),
	status_messages: new Model<{ id: number, dates: string, users: string, message: string, type: number, demote: number }>(["id"]),
	status_ranges: new Model<{ label: string, start_month: number, start_day: number, end_month: number, end_day: number }>(["label"]),
	status_users: new Model<{ label: string, user_id: string }>(["label", "user_id"]),
	timeouts: new Model<{ user_id: string, expires: number, amount: number }>(["user_id"]),
	transactions: new Model<{ id: string, user_id: string, amount: string, mode: number, description: string, target: string, date: string }>(["id"]),
	user_permissions: new Model<{ user_id: string, eval: number, owner: number }>(["user_id"]),
	users: new Model<{ id: string, tag: string, avatar: string | null, bot: number, added_by: string }>(["id"], { useBuffer: true }),
	voice_states: new Model<{ guild_id: string, channel_id: string, user_id: string }>(["user_id"], { useBuffer: true, bufferSize: 300 }),
	web_tokens: new Model<{ user_id: string, token: string, staging: number }>(["user_id"]),
	webhook_aliases: new Model<{ webhook_id: string, webhook_username: string, user_id: string, user_username: string, user_discriminator: string }>(["webhook_id", "webhook_username"])
})

export default exports as typeof import("./orm")
