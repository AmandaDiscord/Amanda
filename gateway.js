const CloudStorm = require("cloudstorm")
const fetchdefault = require("node-fetch").default
/** @type {fetchdefault} */
// @ts-ignore
const fetch = require("node-fetch")

const AmpqpConnector = require("raincache").Connectors.AmqpConnector

const config = require("./config")
const BaseWorkerServer = require("./modules/structures/BaseWorkerServer")

const Gateway = new CloudStorm.Client(config.bot_token, {
	intents: ["DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS", "GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_VOICE_STATES"],
	firstShardId: config.shard_list[0],
	shardAmount: config.total_shards,
	lastShardId: config.shard_list[config.shard_list.length - 1]
})

const worker = new BaseWorkerServer("gateway", config.redis_password)

const presence = {}

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

	connection.channel.assertQueue(config.amqp_data_queue, { durable: false, autoDelete: true })

	Gateway.on("event", data => {
		if (data.t === "READY") readyPayload = data
		// Send data (Gateway -> Cache) (Cache sends data to Client worker)
		const timeoutpromise = new Promise((resolve) => setTimeout(() => resolve(undefined), 5000))
		const d = JSON.stringify(data)

		Promise.race([
			timeoutpromise,
			fetch(`${config.cache_server_protocol}://${config.cache_server_domain}/gateway`, { body: d, headers: { authorization: config.redis_password }, method: "POST" })
		]).then(res => {
			if (!res) connection.channel.sendToQueue(config.amqp_data_queue, Buffer.from(d))
		}).catch(() => {
			connection.channel.sendToQueue(config.amqp_data_queue, Buffer.from(d))
		})
	})

	worker.get("/stats", (request, response) => {
		return response.status(200).send(worker.createDataResponse({ ram: process.memoryUsage(), uptime: process.uptime(), shards: Object.values(Gateway.shardManager.shards).map(s => s.id) })).end()
	})

	worker.get("/login", (request, response) => {
		console.log(`Client logged in at ${new Date().toUTCString()}`)
		return response.status(200).send(worker.createDataResponse(readyPayload)).end()
	})


	worker.patch("/status-update", async (request, response) => {
		if (!request.body) return response.status(204).send(worker.createErrorResponse("No payload")).end()
		/** @type {import("./typings").GatewayStatusUpdateData} */
		const data = request.body
		if (!data.name && !data.status && !data.type && !data.url) return response.status(406).send(worker.createErrorResponse("Missing all status update fields")).end()

		const payload = {}
		const game = {}
		if (data.name !== undefined) game["name"] = data.name
		if (data.type !== undefined) game["type"] = data.type
		if (data.url !== undefined) game["url"] = data.url
		if (data.status !== undefined) payload["status"] = data.status

		if (game.name || game.type || game.url) payload["game"] = game

		if (payload.game && payload.game.name && payload.game.type === undefined) payload.game.type = 0

		Object.assign(presence, payload)

		response.status(200).send(worker.createDataResponse(presence)).end()

		for (const shard of Object.values(Gateway.shardManager.shards)) {
			await shard.statusUpdate(payload)
			await new Promise((res) => setTimeout(() => res(undefined), 5000))
		}
	})


	worker.post("/send-message", async (request, response) => {
		if (!request.body) return response.status(204).send(worker.createErrorResponse("No payload")).end()
		/** @type {import("lavacord").DiscordPacket} */
		const data = request.body

		const sid = Number((BigInt(data.d.guild_id) >> BigInt(22)) % BigInt(config.shard_list.length))
		const shard = Object.values(Gateway.shardManager.shards).find(s => s.id === sid)
		if (shard) {
			try {
				await shard.connector.betterWs.sendMessage(data)
			} catch {
				return response.status(500).send(worker.createErrorResponse(`Unable to send message\nMessage: ${JSON.stringify(data)}`)).end()
			}
			response.status(200).send(worker.createDataResponse("Message sent")).end()
		} else {
			console.log(`No shard found to send WS Message:\n${require("util").inspect(data, true, 2, true)}`)
			response.status(500).send(worker.createErrorResponse(`Unable to send message\nMessage: ${JSON.stringify(data)}`)).end()
		}
	})
})().catch(console.error)

process.on("unhandledRejection", console.error)
