/**
 * @typedef {Object} PassthroughType
 * @property {{bot_token: String, fake_token: String, mysql_password: String, yt_api_key: String, chewey_api_key: String, website_protocol: String, website_domain: String, is_staging: Boolean}} config
 * @property {import("discord.js").Client} client
 * @property {import("./modules/commandstore")} commands
 * @property {import("mysql2/promise").PromisePool} db
 * @property {import("./modules/hotreload")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {Object.<string, ReactionMenu>} reactionMenus
 * @property {{storage: import("discord.js").Collection<import("discord.js").Snowflake, import("./modules/compiledtypings/queue.js")>, songsPlayed: Number, events: import("events").EventEmitter, addQueue: (queue: import("./modules/compiledtypings/queue.js")) => void}} queueManager
 * @property {{storage: import("discord.js").Collection<import("discord.js").Snowflake, import("./modules/compiledtypings/game.js")>, gamesPlayed: Number, addGame: (game: import("./modules/compiledtypings/game.js")) => void}} gameManager
 * @property {import("simple-youtube-api")} youtube
 * @property {import("ws").Server} wss
 */

/**
 * @typedef {Object} ReactionMenu
 * @property {import("discord.js").Message} message
 * @property {Array<ReactionMenuAction>} actions
 * @property {Promise<void>} promise
 * @property {() => Promise<void>} react
 * @property {(remove: Boolean) => void} destroy
 */

/**
 * @typedef {Object} ReactionMenuAction
 * @property {String} emoji
 * @property {Array<String>} [allowedUsers]
 * @property {Array<String>} [deniedUsers]
 * @property {"that"|"thatTotal"|"all"|"total"} [ignore]
 * @property {"user"|"bot"|"all"|"message"} [remove]
 * @property {"reply"|"edit"|"js"} [actionType]
 * @property {(msg: import("discord.js").Message, emoji: import("discord.js").Emoji | import("discord.js").ReactionEmoji, user: import("discord.js").User, messageReaction: import("discord.js").MessageReaction, reactionMenus: Object.<string, ReactionMenu>) => any} [actionData]
 */