const CloudStorm = require("cloudstorm")
const RainCache = require("raincache")

const AmpqpConnector = RainCache.Connectors.AmqpConnector
const RedisStorageEngine = RainCache.Engines.RedisStorageEngine

const config = require("./config")

const Gateway = new CloudStorm.Client(config.bot_token, {
	intents: ["DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS", "GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_VOICE_STATES"],
	firstShardId: config.shard_list[0],
	shardAmount: config.shard_list.length,
	lastShardId: config.shard_list[config.shard_list.length - 1]
})

/** @type {Map<number, Array<string>>} */
const shardGuildMap = new Map()

/**
 * @type {import("@amanda/discordtypings").ReadyData}
 */
let readyPayload = {}

const connection = new AmpqpConnector({
	amqpUrl: config.ampq_is_local ? "amqp://localhost" : `amqp://${config.amqp_username}:${config.redis_password}@${config.amqp_origin}:${config.amqp_port}/amanda-vhost`,
	amqpQueue: config.amqp_cache_queue,
	sendQueue: config.amqp_events_queue
})
const rain = new RainCache({
	storage: {
		default: new RedisStorageEngine({
			redisOptions: {
				host: config.amqp_origin,
				password: config.redis_password
			}
		})
	},
	debug: false
}, connection, connection);

(async () => {
	await rain.initialize()
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
			let sid
			shardGuildMap.forEach((arr, key) => {
				if (arr.includes(data.data.d.guild_id)) sid = key
			})
			const shard = Object.values(Gateway.shardManager.shards).find(s => s.id === sid)
			if (shard) shard.connector.betterWs.sendMessage(data.data)
		}
	})
})().catch(console.error)

/**
 * We obviously want to wait for the cache ops to complete because most of the code still runs under the assumption
 * that rain AT LEAST has some data regarding an entity. I would hate to fetch info about something if we would have
 * just waited for cache ops to finish actually caching things for the worker to be able to access.
 */
async function handleCache(event) {
	if (event.t === "GUILD_CREATE") {
		await rain.cache.guild.update(event.d.id, event.d) // Rain apparently handles members and such
		if (shardGuildMap.get(event.shard_id)) {
			if (!shardGuildMap.get(event.shard_id).includes(event.d.id)) {
				shardGuildMap.get(event.shard_id).push(event.d.id)
			}
		} else shardGuildMap.set(event.shard_id, [event.d.id])
	} else if (event.t === "GUILD_UPDATE") await rain.cache.guild.update(event.d.id, event.d)
	else if (event.t === "GUILD_DELETE") {
		if (!event.d.unavailable) await rain.cache.guild.remove(event.d.id) // Rain apparently also handles deletion of everything in a guild
		else {
			if (shardGuildMap.get(event.shard_id) && shardGuildMap.get(event.shard_id).includes(event.d.id)) {
				shardGuildMap.get(event.shard_id).splice(shardGuildMap.get(event.shard_id).indexOf(event.d.id), 1)
			}
		}
	} else if (event.t === "CHANNEL_CREATE") await rain.cache.channel.update(event.d.id, event.d) // Rain handles permission_overwrites
	else if (event.t === "CHANNEL_DELETE") {
		if (!event.d.guild_id) return
		await rain.cache.channel.remove(event.d.channel_id)
	} else if (event.t === "MESSAGE_CREATE") {
		/** @type {import("@amanda/discordtypings").MessageData} */
		const typed = event.d

		if (typed.member) await rain.cache.member.update(typed.author.id, typed.guild_id, typed.member)
		else await rain.cache.user.update(typed.author.id, typed.author)

		if (typed.mentions && typed.mentions.length > 0 && typed.guild_id) {
			await Promise.all(typed.mentions.map(async user => {
				if (user.member) await rain.cache.member.update(user.id, typed.guild_id, user.member)
				else await rain.cache.user.update(user.id, user)
			}))
		}
	} else if (event.t === "VOICE_STATE_UPDATE") {
		/** @type {import("@amanda/discordtypings").VoiceStateData} */
		const typed = event.d
		if (typed.member && typed.user_id && typed.guild_id) await rain.cache.member.update(typed.user_id, typed.guild_id, { guild_id: typed.guild_id, ...typed.member })
	} else if (event.t === "GUILD_MEMBER_UPDATE") {
		/** @type {import("@amanda/discordtypings").MemberData & { user: import("@amanda/discordtypings").UserData } & { guild_id: string }} */
		const typed = event.d
		await rain.cache.member.update(typed.user.id, typed.guild_id, typed) // This should just only be the ClientUser unless the GUILD_MEMBERS intent is passed
	} else if (event.t === "GUILD_ROLE_CREATE") {
		/** @type {{ guild_id: string, role: import("@amanda/discordtypings").RoleData }} */
		const typed = event.d
		await rain.cache.role.update(typed.role.id, typed.guild_id, typed.role)
	} else if (event.t === "GUILD_ROLE_UPDATE") {
		/** @type {{ guild_id: string, role: import("@amanda/discordtypings").RoleData }} */
		const typed = event.d
		await rain.cache.role.update(typed.role.id, typed.guild_id, typed.role)
	} else if (event.t === "GUILD_ROLE_DELETE") {
		await rain.cache.role.remove(event.d.role_id, event.d.guild_id)
	}
}
