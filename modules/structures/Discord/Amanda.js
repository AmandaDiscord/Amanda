// @ts-check

const Discord = require("thunderstorm")
const Lavalink = require("lavacord")
const RainCache = require("raincache")

const passthrough = require("../../../passthrough")
const config = require("../../../config")

const AmpqpConnector = RainCache.Connectors.AmqpConnector
const RedisStorageEngine = RainCache.Engines.RedisStorageEngine
const MemoryStorageEngine = RainCache.Engines.MemoryStorageEngine

const connection = new AmpqpConnector({
	amqpUrl: `amqp://${config.amqp_username}:${config.redis_password}@${config.amqp_origin}:${config.amqp_port}/amanda-vhost`
})
const mem = new MemoryStorageEngine()
const rain = new RainCache({
	storage: {
		default: new RedisStorageEngine({
			redisOptions: {
				host: config.amqp_origin,
				password: config.redis_password
			}
		}),
		guild: mem,
		voiceState: mem
	},
	structureDefs: {
		guild: {
			whitelist: ["channels", "icon", "id", "joined_at", "member_count", "name", "owner_id", "preferred_locale", "region", "roles", "unavailable", "voice_states"]
		},
		voiceState: {
			whitelist: ["channel_id", "guild_id", "member", "session_id", "user_id"]
		}
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
	}
}

module.exports = Amanda
