/* eslint-disable @typescript-eslint/ban-ts-comment */

// this file is hot reloadable
import path = require("path")

import { Pool } from "pg"

import passthrough = require("../passthrough")
const { sync, config, snow } = passthrough

sync.addTemporaryListener(sync.events, "error", console.error)
sync.addTemporaryListener(sync.events, "any", file => console.log(`${file} was changed`))
sync.addTemporaryListener(snow.requestHandler, "requestError", (p, e) => console.error(`Request Error:\n${p}\n${e}`))

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

	async onDispatch(event: import("discord-api-types/v10").GatewayDispatchPayload & { shard_id: number; }) {
		if (event.t === "GUILD_MEMBER_UPDATE") {
			if (event.d.guild_id !== config.premium_guild_id) return
			if (event.d.roles.includes(config.premium_role_id)) {
				if (!config.db_enabled) return console.warn(`Possible premium member add, but database is disabled so can't check or add: ${event.d.user.username}#${event.d.user.discriminator} (${event.d.user.id})`)
				const sql: typeof import("../client/utils/sql") = require("../client/utils/sql")
				const isAlreadyPremium = await sql.get("SELECT state FROM premium WHERE user_id = $1", [event.d.user.id]).then(r => r?.state as number | undefined)
				if (isAlreadyPremium === 1) return
				if (isAlreadyPremium === 0) {
					await sql.all("UPDATE premium SET state = $1 WHERE user_id = $2", [1, event.d.user.id])
					console.log(`update premium member state: ${event.d.user.username}#${event.d.user.discriminator} (${event.d.user.id})`)
				} else {
					await sql.all("INSERT INTO premium (user_id, state) VALUES ($1, $2)", [event.d.user.id, 1])
					console.log(`new premium member: ${event.d.user.username}#${event.d.user.discriminator} (${event.d.user.id})`)
				}
			}
		}
	},

	async onGlobalError(e: unknown) {
		console.error(e)
		snow.channel.createMessage(config.error_log_channel_id, {
			embeds: [
				{
					title: "Global helper error occured.",
					description: await require("../client/utils/string").stringify(e),
					color: 0xdd2d2d
				}
			]
		})
	}
}

sync.addTemporaryListener(sync.events, path.join(__dirname, "../../config.js"), () => {
	if (config.db_enabled && !passthrough.db) setup.setupPg()
	else if (!config.db_enabled && passthrough.pool) setup.disconnectPg()
})

export = setup
