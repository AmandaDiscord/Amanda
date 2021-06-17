// @ts-check

/**
 * This is a bare bones version of an ORM which is modeled to cover most or all of Amanda's database structure.
 * Very complex statements will be impossible with this.
 * Optimization is top priority.
 */

const passthrough = require("../../passthrough")
const { sync } = passthrough

/**
 * @type {import("./sql")}
 */
const sql = sync.require("./sql")

/**
 * @template {string} T
 * @template {{ [column: string]: string | number }} D
 */
class Model {
	/**
	 * @param {T} table
	 * @param {D} definition The values of the def properties can be anything and are just for type reasons
	 * @param {Array<keyof D>} [primaryKey]
	 * @param {{ useBuffer?: boolean, bufferSize?: number, bufferTimeout?: number }} [options]
	 */
	constructor(table, definition, primaryKey = [], options = {}) {
		this.table = table
		this.definition = definition
		this.primaryKey = primaryKey || []
		/** @type {{ useBuffer: boolean, bufferSize: number, bufferTimeout: number }} */
		this.options = Object.assign({ useBuffer: false, bufferSize: 50, bufferTimeout: 5000 }, options)
	}
}

/**
 * @template {{ [table: string]: Model<any, any> }} M
 */
class Database {
	/**
	 * @param {M} models
	 */
	constructor(models) {
		this.tables = models
		/** @type {{ [table: string]: StatementBuffer }} */
		this.buffers = {}

		for (const model of Object.values(this.tables)) {
			this.buffers[model.table] = { bufferValues: { insert: [] }, timeouts: { insert: null } }
		}
	}

	/**
	 * @param {string} statement
	 * @param {Array<any>} [prepared]
	 */
	raw(statement, prepared) {
		return sql.all(statement, prepared)
	}

	/**
	 * @template {keyof M} T
	 * @param {T} table
	 * @param {Partial<M[T]["definition"]>} properties
	 * @param {{ useBuffer?: boolean }} [options]
	 */
	upsert(table, properties, options = {}) {
		const opts = Object.assign({ useBuffer: this.tables[table].options.useBuffer }, options)
		return this._in(table, properties, opts, "upsert")
	}

	/**
	 * @template {keyof M} T
	 * @param {T} table
	 * @param {Partial<M[T]["definition"]>} properties
	 * @param {{ useBuffer?: boolean }} [options]
	 */
	insert(table, properties, options = {}) {
		const opts = Object.assign({ useBuffer: this.tables[table].options.useBuffer }, options)
		return this._in(table, properties, opts, "insert")
	}

	/**
	 * @template {keyof M} T
	 * @param {T} table
	 * @param {Partial<M[T]["definition"]>} properties
	 * @param {{ useBuffer?: boolean }} options
	 * @param {"insert" | "upsert"} method
	 */
	_in(table, properties, options, method) {
		return new Promise((r, rej) => {
			let res
			if (options.useBuffer) {
				/** @type {Model} */
				const model = this.tables[table]
				if (this.buffers[model.table].bufferValues.insert.length === model.options.bufferSize) {
					clearTimeout(this.buffers[model.table].timeouts.insert)
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

	/**
	 * @template {keyof M} T
	 * @param {T} table
	 * @param {Partial<M[T]["definition"]>} set
	 * @param {Partial<M[T]["definition"]>} [where]
	 */
	update(table, set, where = undefined) {
		const options = {}
		if (where) Object.assign(options, { where: where })
		const res = this._buildStatement("update", table, set, options)
		return sql.all(res.statement, res.prepared)
	}

	/**
	 * @template {keyof M} T
	 * @param {T} table
	 * @param {Partial<M[T]["definition"]> | undefined} [where]
	 * @param {{ select?: Array<(keyof M[T]["definition"])>, limit?: number }} [options]
	 * @returns {Promise<Array<M[T]["definition"]>>}
	 */
	select(table, where = undefined, options = {}) {
		const res = this._buildStatement("select", table, where, options)
		return sql.all(res.statement, res.prepared)
	}

	/**
	 * @template {keyof M} T
	 * @param {T} table
	 * @param {Partial<M[T]["definition"]> | undefined} [where]
	 * @param {{ select?: Array<(keyof M[T]["definition"])> }} [options]
	 * @returns {Promise<M[T]["definition"]>}
	 */
	get(table, where = undefined, options = {}) {
		const opts = Object.assign(options, { limit: 1 })
		const res = this._buildStatement("select", table, where, opts)
		return sql.get(res.statement, res.prepared)
	}

	/**
	 * @template {keyof M} T
	 * @param {T} table
	 * @param {Partial<M[T]["definition"]> | undefined} [where]
	 */
	delete(table, where = undefined) {
		const res = this._buildStatement("delete", table, where)
		return sql.all(res.statement, res.prepared)
	}

	/**
	 * @template {keyof M} T
	 * @param {"select" | "upsert" | "insert" | "update" | "delete"} method
	 * @param {T} table
	 * @param {Partial<M[T]["definition"]> | undefined} [properties]
	 * @param {{ select?: Array<(keyof Partial<M[T]["definition"]>) | "*">, limit?: number, useBuffer?: boolean, where?: Partial<M[T]["definition"]> }} [options]
	 */
	_buildStatement(method, table, properties = undefined, options = {}) {
		options = Object.assign({ select: ["*"], limit: 0, useBuffer: false, where: {} }, options)
		/** @type {Model} */
		const model = this.tables[table]
		let statement = ""
		let preparedAmount = 1
		const prepared = []
		const props = properties ? Object.keys(properties) : []

		const mapped = (!["insert", "upsert"].includes(method)) ? props.map(key => { // insert and upsert maps the prepared indexes. Doing so now would break their indexes.
			const value = properties[key]
			if (value === null) return `${key} ${method === "update" ? "=" : "IS"} NULL`
			const previous = prepared.indexOf(value)
			const index = (previous !== -1) ? previous + 1 : preparedAmount++
			if (previous === -1) prepared.push(value)
			return `${key} = $${index}`
		}) : []

		if (method === "select") {
			statement += `SELECT ${options.select.join(", ")} FROM ${table}`
			if (properties) {
				statement += " WHERE "
				statement += mapped.join(" AND ")
			}
			if (options.limit !== undefined && options.limit !== 0) statement += ` LIMIT ${options.limit}`

		} else if (method === "update") {
			statement += `UPDATE ${table} SET `
			statement += mapped.join(", ")
			if (options.where) {
				const where = Object.keys(options.where).map(key => {
					const value = options.where[key]
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
				/** @type {string} */
				// @ts-ignore
				const name = table
				const buffer = this.buffers[name].bufferValues.insert
				// Get all distinct columns from all entries
				/** @type {Array<string>} */
				// @ts-ignore Array.prototype.flat exists on the environments we're deploying to.
				const distinct = buffer.map(i => Object.keys(i)).flat().filter((val, ind, arr) => arr.indexOf(val) === ind)
				/** @type {Array<string>} */
				const values = []
				/** @type {Array<{ [column: string]: any }>} */
				const addedRows = []
				for (const entry of buffer) {
					// @ts-ignore
					const existingEntry = addedRows.find(i => model.primaryKey.length && model.primaryKey.every(k => entry[k] === i[k]))
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
				const columns = []
				const values = []
				props.map(key => {
					const value = properties[key]
					columns.push(key)
					values.push(`$${preparedAmount++}`)
					prepared.push(value)
				})
				statement += ` (${columns.join(", ")}) VALUES (${values.join(", ")})`
			}
			if (method === "upsert" && model.primaryKey.length) {
				let props2 = props
				if (options.useBuffer) {
					/** @type {string} */
					// @ts-ignore
					const name = table
					const buffer = this.buffers[name].bufferValues.insert
					// Get all distinct columns from all entries
					/** @type {Array<string>} */
					// @ts-ignore Array.prototype.flat exists on the environments we're deploying to.
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

const str = "1"
const num = 1

const AccountPrefixes = new Model("account_prefixes", { user_id: str, prefix: str, status: num }, ["user_id", "prefix"])
const BackgroundSync = new Model("background_sync", { machine_id: str, user_id: str, url: str }, ["machine_id", "user_id"], { useBuffer: true, bufferTimeout: 2000 })
const Bans = new Model("bans", { user_id: str, temporary: num, expires: num }, ["user_id"])
const ChannelOverrides = new Model("channel_overrides", { id: str, type: num, allow: str, deny: str, guild_id: str, channel_id: str }, ["channel_id", "id"], { useBuffer: true, bufferSize: 1000 })
const Channels = new Model("channels", { id: str, type: num, guild_id: str, name: str, rtc_region: str }, ["id"], { useBuffer: true, bufferSize: 1000 })
const Couples = new Model("couples", { user1: str, user2: str, balance: num, married_at: str })
const CSRFTokens = new Model("csrf_tokens", { token: str, login_token: str, expires: num }, ["token"])
const DailyCooldown = new Model("daily_cooldown", { user_id: str, last_claim: num }, ["user_id"])
const Guilds = new Model("guilds", { id: str, name: str, icon: str, member_count: num, owner_id: str, added_by: str }, ["id"], { useBuffer: true, bufferSize: 1000 })
const InteractionGifs = new Model("interaction_gifs", { type: str, url: str })
const LavalinkNodeRegions = new Model("lavalink_node_regions", { host: str, region: str }, ["host", "region"])
const LavalinkNodes = new Model("lavalink_nodes", { host: str, port: num, invidious_origin: str, enabled: num, search_with_invidious: num, name: str }, ["host"])
const MemberRoles = new Model("member_roles", { id: str, guild_id: str, role_id: str }, ["guild_id", "id", "role_id"], { useBuffer: true })
const Members = new Model("members", { id: str, guild_id: str, nick: str, joined_at: str }, ["id", "guild_id"])
const Money = new Model("money", { user_id: str, coins: num, won_coins: num, lost_coins: num, given_coins: num }, ["user_id"])
const MoneyCooldown = new Model("money_cooldown", { user_id: str, command: str, date: num, value: num })
const PendingRelations = new Model("pending_relations", { user1: str, user2: str })
const PeriodicHistory = new Model("periodic_history", { field: str, timestamp: num })
const PlaylistSongs = new Model("playlist_songs", { playlist_id: num, video_id: str, next: str }, ["playlist_id", "video_id"])
const Playlists = new Model("playlists", { playlist_id: num, author: str, name: str, play_count: num }, ["playlist_id"])
const Premium = new Model("premium", { user_id: str, state: num }, ["user_id"])
const RestartNotify = new Model("restart_notify", { bot_id: str, mention_id: str, channel_id: str }, ["bot_id", "mention_id"])
const Roles = new Model("roles", { id: str, permissions: str, guild_id: str }, ["id"], { useBuffer: true, bufferSize: 1000 })
const SettingsGuild = new Model("settings_guild", { key_id: str, setting: str, value: str }, ["key_id", "setting"])
const SettingsSelf = new Model("settings_self", { key_id: str, setting: str, value: str }, ["key_id", "setting"])
const Songs = new Model("songs", { video_id: str, name: str, length: num }, ["video_id"])
const StatLogs = new Model("stat_logs", { time: num, id: str, ram_usage_kb: num, users: num, guilds: num, channels: num, voice_connections: num, uptime: num, shard: num }, ["time", "id", "shard"])
const StatusMessages = new Model("status_messages", { id: num, dates: str, users: str, message: str, type: num, demote: num }, ["id"])
const StatusRanges = new Model("status_ranges", { label: str, start_month: num, start_day: num, end_month: num, end_day: num }, ["label"])
const StatusUsers = new Model("status_users", { label: str, user_id: str }, ["label", "user_id"])
const Timeouts = new Model("timeouts", { user_id: str, expires: num, amount: num }, ["user_id"])
const UserPermissions = new Model("user_permissions", { user_id: str, eval: num, owner: num }, ["user_id"])
const Users = new Model("users", { id: str, tag: str, avatar: str, bot: num, added_by: str }, ["id"], { useBuffer: true })
const VoiceStates = new Model("voice_states", { guild_id: str, channel_id: str, user_id: str }, ["user_id"], { useBuffer: true })
const WebTokens = new Model("web_tokens", { user_id: str, token: str, staging: num }, ["user_id"])
const WebhookAliases = new Model("webhook_aliases", { webhook_id: str, webhook_username: str, user_id: str, user_username: str, user_discriminator: str }, ["webhook_id", "webhook_username"])

const db = new Database({
	account_prefixes: AccountPrefixes,
	background_sync: BackgroundSync,
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
	user_permissions: UserPermissions,
	users: Users,
	voice_states: VoiceStates,
	web_tokens: WebTokens,
	webhook_aliases: WebhookAliases
})

/**
 * @typedef {Object} StatementBuffer
 * @property {{ insert: NodeJS.Timeout | null }} timeouts
 * @property {{ insert: Array<{ [column: string]: any }> }} bufferValues
 */

module.exports.Model = Model
module.exports.Database = Database
module.exports.db = db
