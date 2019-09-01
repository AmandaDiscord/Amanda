//@ts-check

//@ts-ignore
if (process._ptcreated) throw new Error("Do not reload the passthrough file.")
//@ts-ignore
process._ptcreated = true

/**
 * @typedef {Object} Passthrough
 * @property {import("./modules/structures/Discord/Amanda")} client
 * @property {import("./config")} config
 * @property {import("./modules/managers/CommandStore")} commands
 * @property {import("mysql2/promise").PromisePool} db
 * @property {import("./modules/hotreload")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {import("./modules/managers/GameStore")} gameStore
 * @property {Map<string, import("./modules/reactionmenu")>} reactionMenus
 * @property {import("./modules/managers/QueueStore")} queueStore
 * @property {import("./modules/managers/PeriodicHistory")} periodicHistory
 * @property {import("simple-youtube-api")} youtube
 * @property {import("ws").Server} wss
 * @property {Object<string, import("nedb-promises")>} nedb
 * @property {import("frisky-client")} frisky
 */

/**
 * @type {Passthrough}
 */
//@ts-ignore
const passthrough = {}

module.exports = passthrough
