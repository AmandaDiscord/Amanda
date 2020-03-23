// @ts-check

// @ts-ignore
if (process._ptcreated) throw new Error("Do not reload the passthrough file.")
// @ts-ignore
process._ptcreated = true

/**
 * @typedef {Object} Passthrough
 * @property {import("./modules/structures/Discord/Amanda")} client
 * @property {import("./config")} config
 * @property {import("./constants")} constants
 * @property {import("./modules/managers/CommandManager")} commands
 * @property {import("mysql2/promise").Pool} db
 * @property {import("./modules/hotreload")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {import("./modules/managers/GameManager")} games
 * @property {Map<string, import("./modules/structures/Discord/ReactionMenu")>} reactionMenus
 * @property {import("./modules/managers/QueueManager")} queues
 * @property {import("./modules/structures/PeriodicHistory")} periodicHistory
 * @property {import("simple-youtube-api")} youtube
 * @property {import("ws").Server} wss
 * @property {Object<string, import("nedb-promises")>} nedb
 * @property {import("frisky-client")} frisky
 * @property {import("./modules/ipc/ipcbot")} ipc
 * @property {import("taihou")} weeb
 */

/**
 * @type {Passthrough}
 */
// @ts-ignore
const passthrough = {}

module.exports = passthrough
