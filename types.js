/**
 * @typedef {Object} PassthroughType
 * @property {{bot_token: String, fake_token: String, mysql_password: String, yt_api_key: String, chewey_api_key: String, website_protocol: String, website_domain: String, is_staging: Boolean}} config
 * @property {import("discord.js").Client} client
 * @property {import("./modules/commandstore")} commands
 * @property {import("mysql2/promise").PromisePool} db
 * @property {import("./modules/hotreload")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {Object.<string, {message: import("discord.js").Message, actions: Array<{emoji: String, allowedUsers?: Array<String>, deniedUsers?: Array<String>, ignore?: String, remove?: String, actionType?: String, actionData?: any}>, promise: Promise<void>}>} reactionMenus
 * @property {{storage: import("discord.js").Collection<import("discord.js").Snowflake, import("./modules/compiledtypings/queue.js")>, songsPlayed: Number, addQueue: (queue: import("./modules/compiledtypings/queue.js")) => void}} queueManager
 * @property {{storage: import("discord.js").Collection<import("discord.js").Snowflake, import("./modules/compiledtypings/game.js")>, gamesPlayed: Number, addGame: (game: import("./modules/compiledtypings/game.js")) => void}} gameManager
 * @property {import("simple-youtube-api")} youtube
 */