import { BetterTimeout } from "@amanda/shared-utils"

import type { QueryResult, QueryResultRow } from "pg"

import type { AcceptablePrepared } from "./types"

interface Provider {
	all(statement: string, prepared?: Array<AcceptablePrepared>): Promise<Array<any>>
	get(statement: string, prepared?: Array<AcceptablePrepared>): Promise<any | null>
	raw(statement: string, prepared?: Array<AcceptablePrepared>): Promise<QueryResult<any> | null>
}

type StatementBuffer = {
	timeouts: {
		insert: BetterTimeout | null
	}
	bufferValues: {
		insert: Array<Record<string, unknown>>
	}
}

export type InferModelDef<M> = M extends Model<infer D> ? D : unknown


export class Model<D> {
	public options: { useBuffer: boolean; bufferSize: number; bufferTimeout: number }

	public constructor(public primaryKey: Array<keyof D> = [], options: { useBuffer?: boolean; bufferSize?: number; bufferTimeout?: number } = {}) {
		this.options = {
			useBuffer: false,
			bufferSize: 50,
			bufferTimeout: 5000,
			...options
		}
	}
}

export class Database<M extends Record<string, Model<any>>> {
	public buffers: Record<string, StatementBuffer> = {}

	public constructor(public tables: M, public provider: Provider) {
		for (const table of Object.keys(this.tables)) {
			this.buffers[table] = { bufferValues: { insert: [] }, timeouts: { insert: null } }
		}
	}

	public raw<R extends QueryResultRow>(statement: string, prepared?: Array<AcceptablePrepared>): Promise<QueryResult<R> | null> {
		return this.provider.raw(statement, prepared)
	}

	public upsert<T extends keyof M, R extends QueryResultRow>(
		table: T,
		properties: Partial<InferModelDef<M[T]>>,
		options: { useBuffer?: boolean } = {}
	): Promise<QueryResult<R> | null> {
		const opts = { useBuffer: this.tables[table].options.useBuffer, ...options }
		return this._in(table, properties, opts, "upsert")
	}

	public insert<T extends keyof M, R extends QueryResultRow>(
		table: T,
		properties: Partial<InferModelDef<M[T]>>,
		options: { useBuffer?: boolean } = {}
	): Promise<QueryResult<R> | null> {
		const opts = { useBuffer: this.tables[table].options.useBuffer, ...options }
		return this._in(table, properties, opts, "insert")
	}

	private _in<T extends keyof M, R extends QueryResultRow>(
		table: T,
		properties: Partial<InferModelDef<M[T]>>,
		options: { useBuffer?: boolean },
		method: "insert" | "upsert"
	): Promise<QueryResult<R> | null> {
		return new Promise((r, rej) => {
			let res: ReturnType<typeof Database["prototype"]["_buildStatement"]>
			if (options.useBuffer) {
				const model = this.tables[table]
				if (this.buffers[table as string].bufferValues.insert.length === model.options.bufferSize) {
					const timeout = this.buffers[table as string].timeouts.insert
					if (timeout) timeout.clear()
					this.buffers[table as string].timeouts.insert = null
					res = this._buildStatement(method, table, properties, { useBuffer: true })
				} else {
					this.buffers[table as string].bufferValues.insert.push(properties)
					if (!this.buffers[table as string].timeouts.insert) {
						this.buffers[table as string].timeouts.insert = new BetterTimeout().setCallback(() => {
							const res2 = this._buildStatement(method, table, void 0, { useBuffer: true })
							this.provider.raw(res2.statement, res2.prepared).then(r).catch(rej)
							this.buffers[table as string].timeouts.insert = null
						}).setDelay(model.options.bufferTimeout).run()
					}
					return
				}
			} else res = this._buildStatement(method, table, properties)
			this.provider.raw(res.statement, res.prepared).then(r).catch(rej)
		})
	}

	public update<T extends keyof M, R extends QueryResultRow>(
		table: T,
		set: Partial<InferModelDef<M[T]>>,
		where: Partial<InferModelDef<M[T]>> | undefined = void 0
	): Promise<QueryResult<R> | null> {
		const options = {}
		if (where) Object.assign(options, { where: where })
		const res = this._buildStatement("update", table, set, options)
		return this.provider.raw(res.statement, res.prepared)
	}

	public select<T extends keyof M>(
		table: T,
		where: Partial<InferModelDef<M[T]>> | undefined = void 0,
		options: {
			select?: Array<keyof InferModelDef<M[T]>>;
			limit?: number;
			order?: keyof InferModelDef<M[T]>;
			orderDescending?: boolean;
		} = {}
	): Promise<Array<InferModelDef<M[T]>>> {
		const res = this._buildStatement("select", table, where, options)
		return this.provider.all(res.statement, res.prepared)
	}

	public get<T extends keyof M>(
		table: T,
		where: Partial<InferModelDef<M[T]>> | undefined = void 0,
		options: {
			select?: Array<keyof InferModelDef<M[T]>>;
			order?: keyof InferModelDef<M[T]>;
			orderDescending?: boolean;
		} = {}
	): Promise<InferModelDef<M[T]> | null> {
		const opts = Object.assign(options, { limit: 1 })
		const res = this._buildStatement("select", table, where, opts)
		return this.provider.get(res.statement, res.prepared)
	}

	public delete<T extends keyof M, R extends QueryResultRow>(
		table: T,
		where: Partial<InferModelDef<M[T]>> | undefined = void 0
	): Promise<QueryResult<R> | null> {
		const res = this._buildStatement("delete", table, where)
		return this.provider.raw(res.statement, res.prepared)
	}

	public triggerBufferWrite<T extends keyof M>(table: T) {
		const timeout = this.buffers[table as string].timeouts.insert
		timeout?.triggerNow()
	}

	private _buildStatement<T extends keyof M>(
		method: "select" | "upsert" | "insert" | "update" | "delete",
		table: T,
		properties: Partial<InferModelDef<M[T]>> | undefined = void 0,
		options: {
			select?: Array<keyof Partial<InferModelDef<M[T]>> | "*">;
			limit?: number;
			useBuffer?: boolean;
			where?: Partial<InferModelDef<M[T]>>;
			order?: keyof InferModelDef<M[T]>;
			orderDescending?: boolean;
		} = {}
	): { statement: string; prepared: Array<AcceptablePrepared> } {
		options = { select: ["*"], limit: 0, useBuffer: false, where: {}, ...options }
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

		switch (method) {
		case "select":
			statement += `SELECT ${options.select?.join(", ") ?? "*"} FROM ${String(table)}`
			if (properties) {
				statement += " WHERE "
				statement += mapped.join(" AND ")
			}

			if (options.order !== void 0) statement += ` ORDER BY ${String(options.order)}`
			if (options.orderDescending) statement += " DESC"
			if (options.limit !== void 0 && options.limit !== 0) statement += ` LIMIT ${options.limit}`
			break

		case "update":
			statement += `UPDATE ${String(table)} SET `
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
			break

		case "insert":
		case "upsert":
			statement += `INSERT INTO ${String(table)}`
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
			break

		case "delete":
			statement += `DELETE FROM ${String(table)}`
			if (properties) statement += ` WHERE ${mapped.join(" AND ")}`
			break

		default: break
		}

		return { statement: statement, prepared: prepared as Array<AcceptablePrepared> }
	}
}
