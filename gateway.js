const CloudStorm = require("cloudstorm")

const AmpqpConnector = require("raincache").Connectors.AmqpConnector

const config = require("./config")

const Gateway = new CloudStorm.Client(config.bot_token, {
	intents: ["DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS", "GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_VOICE_STATES"],
	firstShardId: config.shard_list[0],
	shardAmount: config.total_shards,
	lastShardId: config.shard_list[config.shard_list.length - 1]
})

/**
 * @type {import("thunderstorm/typings/internal").InboundDataType<"READY">}
 */
let readyPayload = {}

const connection = new AmpqpConnector({
	amqpUrl: `amqp://${config.amqp_username}:${config.redis_password}@${config.amqp_origin}:${config.amqp_port}/amanda-vhost`
});

(async () => {
	await connection.initialize()
	await Gateway.connect()
	console.log("Gateway initialized.")

	connection.channel.assertQueue(config.amqp_gateway_queue, { durable: false, autoDelete: true })
	connection.channel.assertQueue(config.amqp_client_action_queue, { durable: false, autoDelete: true })

	Gateway.on("event", data => {
		if (data.t === "READY") readyPayload = data
		// Send data (Gateway -> Cache) (Cache sends data to Client worker)
		connection.channel.sendToQueue(config.amqp_gateway_queue, Buffer.from(JSON.stringify(data)))
	})

	connection.channel.consume(config.amqp_client_action_queue, async message => {
		connection.channel.ack(message)
		/** @type {import("./typings").ActionRequestData<keyof import("./typings").ActionEvents>} */
		const data = JSON.parse(message.content.toString())

		if (data.event === "GATEWAY_LOGIN") {
			connection.channel.sendToQueue(config.amqp_gateway_queue, Buffer.from(JSON.stringify(readyPayload)))
			console.log(`Client logged in at ${data.time ? new Date(data.time).toUTCString() : new Date().toUTCString()}`)

		} else if (data.event === "GATEWAY_STATUS_UPDATE") {
			/** @type {import("./typings").ActionRequestData<"GATEWAY_STATUS_UPDATE">} */
			const typed = data
			const payload = {}
			const game = {}
			if (typed.data.name) game["name"] = typed.data.name
			if (typed.data.type) game["type"] = typed.data.type || 0
			if (typed.data.url) game["url"] = typed.data.url
			if (typed.data.status) payload["status"] = typed.data.status

			if (game.name || game.type || game.url) payload["game"] = game

			for (const shard of Object.values(Gateway.shardManager.shards)) {
				await shard.statusUpdate(payload)
				await new Promise((res) => setTimeout(() => res(undefined), 5000))
			}

		} else if (data.event === "GATEWAY_SEND_MESSAGE") {
			/** @type {import("./typings").ActionRequestData<"GATEWAY_SEND_MESSAGE">} */
			const typed = data
			const sid = Number((BigInt(typed.data.d.guild_id) >> BigInt(22)) % BigInt(config.shard_list.length))
			const shard = Object.values(Gateway.shardManager.shards).find(s => s.id === sid)
			if (shard) shard.connector.betterWs.sendMessage(typed.data)
			else console.log(`No shard found to send WS Message:\n${require("util").inspect(typed.data, true, 2, true)}`)
		}
	})
})().catch(console.error)

process.on("unhandledRejection", console.error)
