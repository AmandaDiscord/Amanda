/* eslint-disable @typescript-eslint/ban-ts-comment */

// this file is hot reloadable
import path = require("path")
import fs = require("fs")

import { Pool } from "pg"

import passthrough = require("../passthrough")
const { sync, config } = passthrough

const orm: typeof import("../client/utils/orm") = sync.require("../client/utils/orm")

sync.addTemporaryListener(sync.events, "error", console.error)
sync.addTemporaryListener(sync.events, "any", file => console.log(`${file} was changed`))

let timer: NodeJS.Timeout | null = null

const setup = {
	async setupPg() {
		const pool = new Pool({ host: config.sql_domain, user: config.sql_user, password: config.sql_password, database: "main", max: 2 })
		const db = await pool.connect().catch(e => void console.error(e))
		if (!db) return
		await db.query({ text: "SELECT * FROM premium LIMIT 1" })

		console.log("Connected to database")
		passthrough.pool = pool
		passthrough.db = db
	},

	async disconnectPg() {
		await passthrough.pool.end().then(() => console.warn("Database disabled")).catch(console.error)
		// @ts-ignore
		delete passthrough.db; delete passthrough.pool
	},

	backupTimeout: 1000 * 60 * 60,

	backupCount: 5,

	setTimeoutForBackup() {
		const syncedSetup: typeof import("./setup") = sync.require("./setup")
		timer = setTimeout(() => syncedSetup.onBackupTimeout(), syncedSetup.backupTimeout)
		console.log(`Backup slated for ${new Date(Date.now() + syncedSetup.backupTimeout).toUTCString()}`)
	},

	async onBackupTimeout() {
		const syncedSetup: typeof import("./setup") = sync.require("./setup")
		syncedSetup.setTimeoutForBackup()
		if (!config.db_enabled || !passthrough.db) return console.log(`Skipped backup at ${new Date().toUTCString()} as the database is disabled. Nothing to backup`)
		const backup = {}

		for (const table of Object.keys(orm.db.tables)) {
			const rows = await orm.db.get(table as keyof typeof orm.db.tables)
			backup[table] = rows
		}

		const backupDir = path.join(__dirname, "../../backups")

		const existing = await fs.promises.readdir(backupDir).catch(() => [] as Array<string>)

		if (existing.length >= syncedSetup.backupCount) {
			const stats = await Promise.all(existing.map(i => fs.promises.stat(path.join(backupDir, i)).then(s => ({ name: i, stats: s }))))
			const oldest = stats.sort((a, b) => b.stats.ctimeMs - a.stats.ctimeMs).slice(0, existing.length - syncedSetup.backupCount)
			for (const entry of oldest) {
				await fs.promises.unlink(path.join(backupDir, entry.name)).catch(syncedSetup.onGlobalError)
			}
		}

		const fileName = `${new Date().toUTCString()}.json`

		await fs.promises.writeFile(path.join(backupDir, fileName), JSON.stringify(backup))
		console.log(`Done with backup ${fileName}`)
	},

	onGlobalError(e: unknown) {
		console.error(e)
	}
}

sync.addTemporaryListener(sync.events, __filename, () => {
	if (timer) clearTimeout(timer)
	const syncedSetup: typeof import("./setup") = sync.require("./setup")
	syncedSetup.setTimeoutForBackup()
})

sync.addTemporaryListener(sync.events, path.join(__dirname, "../../config.js"), () => {
	if (config.db_enabled && !passthrough.db) setup.setupPg()
	else if (!config.db_enabled && passthrough.pool) setup.disconnectPg()
})

export = setup
