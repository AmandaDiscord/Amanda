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

type InferModelDef<M extends Model<string, Record<string, unknown>>> = M extends Model<string, infer D> ? D : unknown

class Model<T extends string | number | symbol, D extends Record<string, unknown>> {
	public table: T
	public primaryKey: Array<keyof D>
	public options: { useBuffer: boolean; bufferSize: number; bufferTimeout: number }

	public constructor(table: T, primaryKey: Array<keyof D> = [], options: { useBuffer?: boolean; bufferSize?: number; bufferTimeout?: number } = {}) {
		this.table = table
		this.primaryKey = primaryKey || []
		this.options = Object.assign({ useBuffer: false, bufferSize: 50, bufferTimeout: 5000 }, options)
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class Database<M extends Record<string, Model<any, any>>> {
	public tables: M
	public buffers: Record<string, StatementBuffer> = {}

	public constructor(models: M) {
		this.tables = models

		for (const model of Object.values(this.tables)) {
			this.buffers[model.table] = { bufferValues: { insert: [] }, timeouts: { insert: null } }
		}
	}

	public raw(statement: string, prepared: Array<unknown>) {
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
				if (this.buffers[model.table].bufferValues.insert.length === model.options.bufferSize) {
					const timeout = this.buffers[model.table].timeouts.insert
					if (timeout) clearTimeout(timeout)
					this.buffers[model.table].timeouts.insert = null
					res = this._buildStatement(method, table, properties, { useBuffer: true })
				} else {
					this.buffers[model.table].bufferValues.insert.push(properties)
					if (!this.buffers[model.table].timeouts.insert) {
						this.buffers[model.table].timeouts.insert = setTimeout(() => {
							const res2 = this._buildStatement(method, table, undefined, { useBuffer: true })
							r(sql.all(res2.statement, res2.prepared).catch(rej))
							this.buffers[model.table].timeouts.insert = null
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

	public get<T extends keyof M>(table: T, where: Partial<InferModelDef<M[T]>> | undefined = undefined, options: { select?: Array<keyof InferModelDef<M[T]>>; order?: keyof InferModelDef<M[T]>; arderDescending?: boolean; } = {}): Promise<InferModelDef<M[T]>> {
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
		const model = this.tables[table] as unknown as Model<T, InferModelDef<M[T]>>
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

const AccountPrefixes = new Model<"account_prefixes", { user_id: string; prefix: string; status: number; }>("account_prefixes", ["user_id", "prefix"])
const BackgroundSync = new Model<"background_sync", { machine_id: string, user_id: string, url: string }>("background_sync", ["machine_id", "user_id"], { useBuffer: true, bufferTimeout: 2000 })
const BankAccess = new Model<"bank_access", { id: string, user_id: string }>("bank_access")
const BankAccounts = new Model<"bank_accounts", { id: string, amount: string, type: number }>("bank_accounts", ["id"])
const Bans = new Model<"bans", { user_id: string, temporary: number, expires: number }>("bans", ["user_id"])
const ChannelOverrides = new Model<"channel_overrides", { id: string, type: number, allow: string, deny: string, guild_id: string, channel_id: string }>("channel_overrides", ["channel_id", "id"], { useBuffer: true, bufferSize: 5000 })
const Channels = new Model<"channels", { id: string, type: number, guild_id: string, name: string, rtc_region: string }>("channels", ["id"], { useBuffer: true, bufferSize: 5000 })
const Couples = new Model<"couples", { user1: string, user2: string, married_at: string, balance: number }>("couples")
const CSRFTokens = new Model<"csrf_tokens", { token: string, login_token: string, expires: number }>("csrf_tokens", ["token"])
const DailyCooldown = new Model<"daily_cooldown", { user_id: string, last_claim: number }>("daily_cooldown", ["user_id"])
const Guilds = new Model<"guilds", { id: string, name: string, icon: string, member_count: number, owner_id: string, added_by: string }>("guilds", ["id"], { useBuffer: true, bufferSize: 1000 })
const InteractionGifs = new Model<"interaction_gifs", { type: string, url: string }>("interaction_gifs")
const LavalinkNodeRegions = new Model<"lavalink_node_regions", { host: string, region: string }>("lavalink_node_regions", ["host", "region"])
const LavalinkNodes = new Model<"lavalink_nodes", { host: string, port: number, invidious_origin: string, enabled: number, search_with_invidious: number, name: string }>("lavalink_nodes", ["host"])
const MemberRoles = new Model<"member_roles", { id: string, guild_id: string, role_id: string }>("member_roles", ["guild_id", "id", "role_id"], { useBuffer: true })
const Members = new Model<"members", { id: string, guild_id: string, nick: string, joined_at: string }>("members", ["id", "guild_id"])
const Money = new Model<"money", { user_id: string, coins: number }>("money", ["user_id"])
const MoneyCooldown = new Model<"money_cooldown", { user_id: string, command: string, date: number, value: number }>("money_cooldown")
const PendingRelations = new Model<"pending_relations", { user1: string, user2: string }>("pending_relations")
const PeriodicHistory = new Model<"periodic_history", { field: string, timestamp: number }>("periodic_history")
const PlaylistSongs = new Model<"playlist_songs", { playlist_id: number, video_id: string, next: string }>("playlist_songs", ["playlist_id", "video_id"])
const Playlists = new Model<"playlists", { playlist_id: number, author: string, name: string, play_count: number }>("playlists", ["playlist_id"])
const Premium = new Model<"premium", { user_id: string, state: number }>("premium", ["user_id"])
const RestartNotify = new Model<"restart_notify", { bot_id: string, mention_id: string, channel_id: string }>("restart_notify", ["bot_id", "mention_id"])
const Roles = new Model<"roles", { id: string, permissions: string, guild_id: string }>("roles", ["id"], { useBuffer: true, bufferSize: 5000 })
const SettingsGuild = new Model<"settings_guild", { key_id: string, setting: string, value: string }>("settings_guild", ["key_id", "setting"])
const SettingsSelf = new Model<"settings_self", { key_id: string, setting: string, value: string }>("settings_self", ["key_id", "setting"])
const Songs = new Model<"songs", { video_id: string, name: string, length: number }>("songs", ["video_id"])
const StatLogs = new Model<"stat_logs", { time: number, id: string, ram_usage_kb: number, users: number, guilds: number, channels: number, voice_connections: number, uptime: number, shard: number }>("stat_logs", ["time", "id", "shard"])
const StatusMessages = new Model<"status_messages", { id: number, dates: string, users: string, message: string, type: number, demote: number }>("status_messages", ["id"])
const StatusRanges = new Model<"status_ranges", { label: string, start_month: number, start_day: number, end_month: number, end_day: number }>("status_ranges", ["label"])
const StatusUsers = new Model<"status_users", { label: string, user_id: string }>("status_users", ["label", "user_id"])
const Timeouts = new Model<"timeouts", { user_id: string, expires: number, amount: number }>("timeouts", ["user_id"])
const Transactions = new Model<"transactions", { id: string, user_id: string, amount: string, mode: number, description: string, target: string, date: string }>("transactions", ["id"])
const UserPermissions = new Model<"user_permissions", { user_id: string, eval: number, owner: number }>("user_permissions", ["user_id"])
const Users = new Model<"users", { id: string, tag: string, avatar: string, bot: number, added_by: string }>("users", ["id"], { useBuffer: true })
const VoiceStates = new Model<"voice_states", { guild_id: string, channel_id: string, user_id: string }>("voice_states", ["user_id"], { useBuffer: true, bufferSize: 300 })
const WebTokens = new Model<"web_tokens", { user_id: string, token: string, staging: number }>("web_tokens", ["user_id"])
const WebhookAliases = new Model<"webhook_aliases", { webhook_id: string, webhook_username: string, user_id: string, user_username: string, user_discriminator: string }>("webhook_aliases", ["webhook_id", "webhook_username"])

const db = new Database({
	account_prefixes: AccountPrefixes,
	background_sync: BackgroundSync,
	bank_access: BankAccess,
	bank_accounts: BankAccounts,
	bans: Bans,
	channel_overrides: ChannelOverrides,
	channels: Channels,
	couples: Couples,
	csrf_tokens: CSRFTokens,
	daily_cooldown: DailyCooldown,
	guilds: Guilds,
	interaction_gifs: InteractionGifs,
	lavalink_node_regions: LavalinkNodeRegions,
	lavalink_nodes: LavalinkNodes,
	member_roles: MemberRoles,
	members: Members,
	money: Money,
	money_cooldown: MoneyCooldown,
	pending_relations: PendingRelations,
	periodic_history: PeriodicHistory,
	playlist_songs: PlaylistSongs,
	playlists: Playlists,
	premium: Premium,
	restart_notify: RestartNotify,
	roles: Roles,
	settings_guild: SettingsGuild,
	settings_self: SettingsSelf,
	songs: Songs,
	stat_logs: StatLogs,
	status_messages: StatusMessages,
	status_ranges: StatusRanges,
	status_users: StatusUsers,
	timeouts: Timeouts,
	transactions: Transactions,
	user_permissions: UserPermissions,
	users: Users,
	voice_states: VoiceStates,
	web_tokens: WebTokens,
	webhook_aliases: WebhookAliases
})

export = {
	db,
	Model,
	Database
}
