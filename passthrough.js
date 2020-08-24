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
 * @property {import("@amanda/commandmanager")} commands
 * @property {import("mysql2/promise").Pool} db
 * @property {import("@amanda/reloader")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {import("./typings").internalEvents} internalEvents
 * @property {import("./modules/managers/GameManager")} games
 * @property {import("./modules/managers/QueueManager")} queues
 * @property {import("./modules/managers/StreakManager")} streaks
 * @property {import("./modules/structures/PeriodicHistory")} periodicHistory
 * @property {import("simple-youtube-api")} youtube
 * @property {import("ws").Server} wss
 * @property {Object<string, import("nedb-promises")>} nedb
 * @property {import("frisky-client/lib/Frisky")} frisky
 * @property {import("./modules/ipc/ipcbot")} ipc
 * @property {import("taihou")} weeb
 * @property {string} statusPrefix
 * @property {Array<{ guildID: string, channelID: string, userID: string, bot: boolean }>} voiceStates
 */

/**
 * @type {Passthrough}
 */
// @ts-ignore
const passthrough = {}

module.exports = passthrough
