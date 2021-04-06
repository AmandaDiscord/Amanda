const util = require("util")
const mysql = require("mysql2/promise")
const Postgres = require("pg")

const config = require("../config.js")

const passthrough = require("../passthrough")

const db = mysql.createPool({
	host: config.sql_domain,
	user: "amanda",
	password: config.sql_password,
	database: "money",
	connectionLimit: 5
})

const pool = new Postgres.Pool({
	host: config.sql_domain,
	user: "amanda",
	password: config.sql_password,
	database: "main",
	max: 2
})

/**
 * @param {string} statement
 * @param {Array<any>} [params]
 * @returns {Promise<Array<any>>}
 */
 function mysql_all(statement, params) {
	// @ts-ignore
	return db.execute(statement, params).then(result => result[0])
}

const column_translations = {
	userID: "user_id",
	guildID: "guild_id",
	keyID: "key_id",
	machineID: "machine_id",
	playlistID: "playlist_id",
	videoID: "video_id",
	botID: "bot_id",
	channelID: "channel_id",
	woncoins: "won_coins",
	lostcoins: "lost_coins",
	givencoins: "given_coins",
	marriedAt: "married_at",
	loginToken: "login_token",
	lastClaim: "last_claim"
}

const table_translations = {
	Bans: "bans",
	Couples: "couples",
	PlaylistSongs: "playlist_songs",
	Playlists: "playlists",
	SettingsGuild: "settings_guild",
	SettingsSelf: "settings_self",
	Songs: "songs",
	WebTokens: "web_tokens",
	money: "money"
}

;(async () => {
	const [pgpool] = await Promise.all([
		pool.connect(),
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	])

	passthrough.db = pgpool
	const orm = require("../modules/utilities/orm")

	for (const table of Object.keys(table_translations)) {
		const pg_table = table_translations[table]
		const rows = await mysql_all(`SELECT * FROM ${table}`)
		await orm.db.delete(pg_table)
		for (const row of rows) {
			let payload = {}
			for (const column of Object.keys(row)) {
				if (column_translations[column]) payload[column_translations[column]] = row[column]
				else payload[column] = row[column]
			}
			orm.db.insert(pg_table, payload)
			console.log(`Done with entry:\n${util.inspect(payload)}\nFor Table: ${table} => ${pg_table}`)
		}
		console.log(`Done with table ${table} => ${pg_table}\n\n`)
	}
})()
