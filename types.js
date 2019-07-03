/**
 * @typedef {Object} PassthroughType
 * @property {Object} config
 * @property {String} config.bot_token
 * @property {String} config.fake_token
 * @property {String} config.mysql_password
 * @property {String} config.yt_api_key
 * @property {String} config.chewey_api_key
 * @property {String} config.website_protocol
 * @property {String} config.website_domain
 * @property {import("discord.js").Client} client
 * @property {any} commands
 * @property {import("mysql2/promise").PromisePool} db
 * @property {import("./hotreload")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {Object} queueManager
 * @property {import("discord.js").Collection<import("discord.js").Snowflake, Queue>} queueManager.storage
 * @property {Function} queueManager.addQueue
 */