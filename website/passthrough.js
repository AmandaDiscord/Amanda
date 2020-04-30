// @ts-check

/**
 * @typedef {Object} Passthrough
 * @property {import("../config")} config
 * @property {import("mysql2/promise").Pool} db
 * @property {import("snowtransfer")} snow
 * @property {() => {}} loadAPI
 * @property {(page: any) => Promise<any>} resolveTemplates
 * @property {Map<string, (locals?: any) => string>} pugCache
 * @property {Map<string, string>} sassCache
 * @property {import("ws").Server} wss
 * @property {import("./modules/ipcserver")} ipc
 * @property {import("@amanda/reloader")} reloader
 * @property {import("discord-bot-analytics")} analytics
 */

/**
 * @type {Passthrough}
 */
// @ts-ignore
const passthrough = {}

module.exports = passthrough
