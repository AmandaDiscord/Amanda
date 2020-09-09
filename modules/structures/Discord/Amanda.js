// @ts-check

const Discord = require("thunderstorm")
const Lavalink = require("lavacord")
const RainCache = require("raincache")

const passthrough = require("../../../passthrough")
const config = require("../../../config")

const AmpqpConnector = RainCache.Connectors.AmqpConnector
const RedisStorageEngine = RainCache.Engines.RedisStorageEngine

const connection = new AmpqpConnector({
	amqpUrl: `amqp://${config.amqp_username}:${config.redis_password}@${config.amqp_origin}:${config.amqp_port}/amanda-vhost`
})
// @ts-ignore
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
}, connection, connection)

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

		this.rain = rain
		this.connector = connection
	}
}

module.exports = Amanda
