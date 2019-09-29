//@ts-check

/**
 * @typedef {Object} Passthrough
 * @property {import("../config")} config
 * @property {import("mysql2/promise").PromisePool} db
 * @property {import("snowtransfer")} snow
 * @property {() => {}} loadAPI
 * @property {(page: any) => Promise<any>} resolveTemplates
 * @property {Map<string, (locals?: any) => string>} pugCache
 * @property {Map<string, string>} sassCache
 * @property {import("ws").Server} wss
 */

/**
 * @type {Passthrough}
 */
//@ts-ignore
const passthrough = {}

module.exports = passthrough
