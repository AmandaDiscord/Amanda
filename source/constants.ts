// Receive/Send annotations will be in relation to main thread

let config: import("./types").Config
try {
	config = require("../config")
} catch {
	config = {} as import("./types").Config
}

export const GATEWAY_WORKER_CODES = {
	/**
	 * Receive
	 */
	DISCORD: 0 as const,
	/**
	 * Send
	 */
	STATS: 1 as const,
	/**
	 * Send
	 */
	STATUS_UPDATE: 2 as const,
	/**
	 * Send
	 */
	SEND_MESSAGE: 3 as const,
	/**
	 * Receive
	 */
	RESPONSE: 4 as const,
	/**
	 * Receive
	 */
	ERROR_RESPONSE: 5 as const
}
export const baseURL = `${config.website_protocol}://${config.website_domain}`
export const patreon = `${baseURL}/to/patreon`
export const paypal = `${baseURL}/to/paypal`
export const twitch = "https://www.twitch.tv/papiophidian"
export const add = `${baseURL}/to/add`
export const server = `${baseURL}/to/server`
export const invite_link_for_help = "https://discord.gg/X5naRFu"
export const stats = `${baseURL}/to/stats`
export const privacy = `${baseURL}/to/privacy`
export const terms = `${baseURL}/to/terms`
export const todo = `${baseURL}/to/todo`
export const standard_embed_color = 0x2f3136
export const discord_background_color = 0x36393f
export const chewey_api = "https://api.chewey-bot.top"
export const lavalinkNodes = [] as Array<import("./types").InferModelDef<typeof import("./utils/orm")["db"]["tables"]["lavalink_nodes"]> & { regions: Array<string>; id: string; resumeKey?: string; resumeTimeout?: number; password: string }>
const devNode = { host: "localhost", port: 10402, invidious_origin: "http://amanda.moe:3000", enabled: 1, search_with_invidious: 0, name: "DEV", regions: ["us-west"], password: config.lavalink_password, id: "dev", resumeKey: `${Buffer.from(config.bot_token?.split(".")[0], "base64").toString("utf8")}/dev`, resumeTimeout: 75 }
if (config.is_dev_env) lavalinkNodes.push(devNode)

export const frisky_placeholder = `${baseURL}/images/frisky-new.webp`
export const local_placeholder = `${baseURL}/images/local.webp`
export const listen_moe_placeholder = `${baseURL}/images/listen-moe-logo.webp`

// eslint-disable-next-line no-shadow
export enum WebsiteOPCodes {
	IDENTIFY = 1,
	ACKNOWLEDGE,
	STATE,
	TRACK_ADD,
	TRACK_REMOVE,
	TRACK_UPDATE,
	NEXT,
	TIME_UPDATE,
	TOGGLE_PLAYBACK,
	SKIP,
	STOP,
	ATTRIBUTES_CHANGE,
	CLEAR_QUEUE,
	LISTENERS_UPDATE,

	ACCEPT,
	CREATE,
	STATS
}

export default exports as typeof import("./constants")
