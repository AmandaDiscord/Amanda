/**
 * @typedef {Object} PassthroughType
 * @property {{bot_token: String, fake_token: String, mysql_password: String, yt_api_key: String, chewey_api_key: String, website_protocol: String, website_domain: String, is_staging: Boolean}} config
 * @property {import("./modules/structures").Amanda} client
 * @property {import("./modules/managers/Discord/Commands")} commands
 * @property {import("mysql2/promise").PromisePool} db
 * @property {import("./modules/hotreload")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {import("./modules/managers/Discord/Queues")} queueManager
 * @property {import("./modules/managers/Discord/Games")} gameManager
 * @property {import("simple-youtube-api")} youtube
 * @property {import("ws").Server} wss
 */