const CloudStorm = require("cloudstorm")
const RainCache = require("raincache")
const mysql = require("mysql2/promise")
const passthrough = require("./passthrough")

const AmpqpConnector = RainCache.Connectors.AmqpConnector

const config = require("./config")

const Gateway = new CloudStorm.Client(config.bot_token, {
	intents: ["DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS", "GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_VOICE_STATES"],
	firstShardId: config.shard_list[0],
	shardAmount: config.total_shards,
	lastShardId: config.shard_list[config.shard_list.length - 1]
})

const cache = mysql.createPool({
	host: config.amqp_origin,
	user: "amanda",
	password: config.mysql_password,
	database: "cache",
	connectionLimit: 5
})

Object.assign(passthrough, { db: cache, cache })

const sql = require("./modules/utilities/sql")

/**
 * @type {import("@amanda/discordtypings").ReadyData}
 */
let readyPayload = {}

const connection = new AmpqpConnector({
	amqpUrl: `amqp://${config.amqp_username}:${config.redis_password}@${config.amqp_origin}:${config.amqp_port}/amanda-vhost`,
	amqpQueue: config.amqp_cache_queue,
	sendQueue: config.amqp_events_queue
});

(async () => {
	await Promise.all([
		cache.query("SET NAMES 'utf8mb4'"),
		cache.query("SET CHARACTER SET utf8mb4")
	])

	await connection.initialize()
	await Gateway.connect()
	console.log("Cache and Gateway initialized")

	// Register queue for CloudStorm event forwarding (Gateway -> Client)
	connection.channel.assertQueue(config.amqp_events_queue, { durable: false, autoDelete: true })
	connection.channel.assertQueue(config.amqp_client_send_queue, { durable: false, autoDelete: true })

	Gateway.on("event", async (data) => {
		if (data.t === "READY") readyPayload = data
		// Send data (Gateway -> Cache)
		await handleCache(data)
		// Send data (Gateway -> Client)
		connection.channel.sendToQueue(config.amqp_events_queue, Buffer.from(JSON.stringify(data)))
	})
	connection.channel.consume(config.amqp_client_send_queue, (message) => {
		connection.channel.ack(message)
		const data = JSON.parse(message.content.toString())

		if (data.event === "LOGIN") {
			connection.channel.sendToQueue(config.amqp_events_queue, Buffer.from(JSON.stringify(readyPayload)))
			console.log(`Client logged in at ${data.time ? new Date(data.time).toUTCString() : new Date().toUTCString()}`)
		} else if (data.event === "STATUS_UPDATE") {
			const payload = {}
			const game = {}
			if (data.name) game["name"] = data.name
			if (data.type) game["type"] = data.type || 0
			if (data.url) game["url"] = data.url
			if (data.status) payload["status"] = status

			if (game.name || game.type || game.url) payload["game"] = game

			Gateway.statusUpdate(payload)
		} else if (data.event === "SEND_MESSAGE") {
			const sid = Number((BigInt(data.data.d.guild_id) >> BigInt(22)) % BigInt(config.shard_list.length))
			const shard = Object.values(Gateway.shardManager.shards).find(s => s.id === sid)
			if (shard) shard.connector.betterWs.sendMessage(data.data)
			else console.log(`No shard found to send WS Message:\n${require("util").inspect(data.data, true, 2, true)}`)
		}
	})
})().catch(console.error)

/**
 * We obviously want to wait for the cache ops to complete because most of the code still runs under the assumption
 * that rain AT LEAST has some data regarding an entity. I would hate to fetch info about something if we would have
 * just waited for cache ops to finish actually caching things for the worker to be able to access.
 */
async function handleCache(event) {
	if (event.t === "GUILD_CREATE") await require("./cacheHandler").handleGuild(event.d, sql)
	else if (event.t === "GUILD_UPDATE") await require("./cacheHandler").handleGuild(event.d, sql)
	else if (event.t === "GUILD_DELETE") {
		if (!event.d.unavailable) {
			await sql.all("DELETE FROM Guilds WHERE id =?", event.d.id)
			await sql.all("DELETE FROM Channels WHERE guild_id =?", event.d.id)
			await sql.all("DELETE FROM Members WHERE guild_id =?", event.d.id)
			await sql.all("DELETE FROM Roles WHERE guild_id =?", event.d.id)
			await sql.all("DELETE FROM PermissionOverwrites WHERE guild_id =?", event.d.id)
			await sql.all("DELETE FROM VoiceStates WHERE guild_id =?", event.d.id)
		}
	} else if (event.t === "CHANNEL_CREATE") {
		if (!event.d.guild_id) return
		await require("./cacheHandler").handleChannel(event.d, event.d.guild_id, sql)
	} else if (event.t === "CHANNEL_DELETE") {
		if (!event.d.guild_id) return
		await sql.all("DELETE FROM Channels WHERE id =?", event.d.id)
		await sql.all("DELETE FROM PermissionOverwrites WHERE channel_id =?", event.d.id)
	} else if (event.t === "MESSAGE_CREATE") {
		/** @type {import("@amanda/discordtypings").MessageData} */
		const typed = event.d

		if (typed.member) {
			if (!typed.author) return
			require("./cacheHandler").handleMember(typed.member, typed.author, typed.guild_id, sql)
		}

		if (typed.mentions && typed.mentions.length > 0 && typed.guild_id) {
			await Promise.all(typed.mentions.map(async user => {
				if (user.member) await require("./cacheHandler").handleMember(user.member, user, typed.guild_id, sql)
			}))
		}
	} else if (event.t === "VOICE_STATE_UPDATE") {
		/** @type {import("@amanda/discordtypings").VoiceStateData} */
		const typed = event.d
		// if (typed.member && typed.user_id && typed.guild_id) await rain.cache.member.update(typed.user_id, typed.guild_id, { guild_id: typed.guild_id, ...typed.member })
	} else if (event.t === "GUILD_MEMBER_UPDATE") {
		/** @type {import("@amanda/discordtypings").MemberData & { user: import("@amanda/discordtypings").UserData } & { guild_id: string }} */
		const typed = event.d
		await require("./cacheHandler").handleMember(typed, typed.user, typed.guild_id, sql) // This should just only be the ClientUser unless the GUILD_MEMBERS intent is passed
	} else if (event.t === "GUILD_ROLE_CREATE") {
		/** @type {{ guild_id: string, role: import("@amanda/discordtypings").RoleData }} */
		const typed = event.d
		await sql.all("REPLACE INTO Roles (id, name, guild_id, permissions) VALUES (?, ?, ?, ?)", [typed.role.id, typed.role.name, typed.guild_id, typed.role.permissions || 0])
	} else if (event.t === "GUILD_ROLE_UPDATE") {
		/** @type {{ guild_id: string, role: import("@amanda/discordtypings").RoleData }} */
		const typed = event.d
		await sql.all("REPLACE INTO Roles (id, name, guild_id, permissions) VALUES (?, ?, ?, ?)", [typed.role.id, typed.role.name, typed.guild_id, typed.role.permissions || 0])
	} else if (event.t === "GUILD_ROLE_DELETE") {
		await sql.all("DELETE FROM Roles WHERE id =?", event.d.role_id)
	}
}
