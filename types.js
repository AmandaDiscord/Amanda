/**
 * @typedef {Object} PassthroughType
 * @property {import("./config.js")} config
 * @property {import("./modules/structures").Amanda} client
 * @property {import("./modules/managers").CommandStore} commands
 * @property {import("mysql2/promise").PromisePool} db
 * @property {import("./modules/hotreload")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {import("./modules/managers").QueueManager} queueManager
 * @property {import("./modules/managers").GameManager} gameManager
 * @property {import("simple-youtube-api")} youtube
 * @property {import("ws").Server} wss
 */
/**
 * @typedef {Object} LLEndEvent
 * @property {String} guildId
 * @property {String} reason
 * @property {String} track
 * @property {"event"} op
 * @property {"TrackEndEvent"} type
 */
