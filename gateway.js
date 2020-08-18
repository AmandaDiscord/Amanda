const CloudStorm = require("cloudstorm")
const RainCache = require("raincache")
const { Constants } = require("thunderstorm")

const AmpqpConnector = RainCache.Connectors.AmqpConnector
const RedisStorageEngine = RainCache.Engines.RedisStorageEngine

const config = require("./config")

const Gateway = new CloudStorm.Client(config.bot_token, {
	intents: ["DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS", "GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_VOICE_STATES"]
})

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
		const data = JSON.parse(message.content.toString())

		if (data.event === "LOGIN") {
			connection.channel.sendToQueue(config.amqp_events_queue, Buffer.from(JSON.stringify(readyPayload)))
			console.log(`Client logged in at ${data.time ? new Date(data.time).toUTCString() : new Date().toUTCString()}`)
		}
		if (data.event === "STATUS_UPDATE") {
			const payload = {}
			const game = {}
			if (data.name) game["name"] = data.name
			if (data.type) game["type"] = data.type || 0
			if (data.url) game["url"] = data.url
			if (data.status) payload["status"] = status

			if (game.name || game.type || game.url) payload["game"] = game

			Gateway.statusUpdate(payload)
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
		/** @type {import("@amanda/discordtypings").GuildData} */
		const typed = event.d
		if (typed.channels) await Promise.all(typed.channels.map(channel => rain.cache.channel.update(channel.id, { id: channel.id, name: channel.name, permission_overwrites: channel.permission_overwrites, type: channel.type })))
		await rain.cache.guild.update(typed.id, typed)
	} else if (event.t === "CHANNEL_CREATE") {
		/** @type {import("@amanda/discordtypings").ChannelData} */
		const typed = event.d
		await rain.cache.channel.update(typed.id, { id: typed.id, name: typed.name, type: typed.type })
	} else if (event.t === "MESSAGE_CREATE") {
		/** @type {import("@amanda/discordtypings").MessageData} */
		const typed = event.d
		if (typed.author && typed.author.id) await rain.cache.user.update(typed.author.id, typed.author)
		if (typed.member && typed.author && typed.author.id && typed.guild_id) await rain.cache.member.update(typed.author.id, typed.guild_id, { guild_id: typed.guild_id, ...typed.member })
		if (typed.mentions && typed.mentions.length > 0 && typed.guild_id) {
			await Promise.all([typed.mentions.map(async user => {
				if (user.member) {
					await rain.cache.member.update(user.id, typed.guild_id, { id: user.id, ...user.member })
					delete user.member
					await rain.cache.user.update(user.id, user)
				} else await rain.cache.user.update(user.id, user)
			})])
		}
	} else if (event.t === "VOICE_STATE_UPDATE") {
		/** @type {import("@amanda/discordtypings").VoiceStateData} */
		const typed = event.d
		if (typed.member && typed.user_id && typed.guild_id) await rain.cache.member.update(typed.user_id, typed.guild_id, { guild_id: typed.guild_id, ...typed.member })
	} else return false
}
