// @ts-check

const Discord = require("thunderstorm")
const Lavalink = require("lavacord")
const RainCache = require("raincache")

const passthrough = require("../../../passthrough")
const config = require("../../../config")

const AmpqpConnector = RainCache.Connectors.AmqpConnector
const RedisStorageEngine = RainCache.Engines.RedisStorageEngine

const connection = new AmpqpConnector({
	amqpUrl: config.ampq_is_local ? "amqp://localhost" : `amqp://${config.amqp_username}:${config.redis_password}@${config.amqp_origin}:${config.amqp_port}/amanda-vhost`
})
// @ts-ignore
const cache = new RainCache({
	storage: {
		default: new RedisStorageEngine({
			redisOptions: {
				host: config.amqp_origin,
				password: config.redis_password
			}
		})
	},
	debug: false
})

class Amanda extends Discord.Client {
	/**
	 * @param {Discord.ClientOptions} [options]
	 */
	constructor(options) {
		super(options)

		/** @type {Lavalink.Manager} */
		this.lavalink

		/**
		 * Do not use this
		 * @type {import("../../../passthrough")}
		 * @private
		 */
		this.passthrough = passthrough

		this.rain = cache
		this.connector = connection
	}
}

module.exports = Amanda
