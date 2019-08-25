if (process._ptcreated) throw new Error("Do not reload the passthrough file.")
process._ptcreated = true

const CommandStore = require("./modules/managers/CommandStore")
const GameManager = require("./modules/managers/GameManager")

/**
 * @typedef {Object} Passthrough
 * @property {import("discord.js").Client} client
 * @property {import("./config")} config
 * @property {import("./modules/managers/CommandStore")} commands
 * @property {import("mysql2/promise").PromisePool} db
 * @property {import("./modules/hotreload")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {import("./modules/managers").GameManager} gameManager
 * @property {Map<string, import("./modules/reactionmenu")>} reactionMenus
 * @property {import("simple-youtube-api")} youtube
 * @property {import("ws").Server} wss
 */

/**
 * @type {Passthrough}
 */
const passthrough = {}

module.exports = passthrough

passthrough.reactionMenus = new Map()
passthrough.commands = new CommandStore()
passthrough.gameManager = new GameManager()
