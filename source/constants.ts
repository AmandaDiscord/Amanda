// Receive/Send annotations will be in relation to main thread

const config = require("../config") as import("./types").Config // TypeScript WILL include files that use import in any way (type annotations or otherwise)

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
export const standard_embed_color = 0x2f3136
export const discord_background_color = 0x36393f
export const chewey_api = "https://api.chewey-bot.top"
export const lavalinkNodes = [] as Array<import("./types").InferModelDef<typeof import("./utils/orm")["db"]["tables"]["lavalink_nodes"]> & { regions: Array<string>; id: string; resumeKey?: string; resumeTimeout?: number; password: string }>
const devNode = { host: "localhost", port: 10402, invidious_origin: "http://amanda.moe:3000", enabled: 1, search_with_invidious: 0, name: "DEV", regions: ["us-west"], password: config.lavalink_password, id: "dev", resumeKey: "415969262688010241/dev-0", resumeTimeout: 75 }
const shouldAdd = true as boolean
if (shouldAdd) lavalinkNodes.push(devNode)


export const frisky_placeholder = `${baseURL}/images/frisky-small.png`
export const soundcloud_placeholder = `${baseURL}/images/soundcloud-logo-rectangle.jpg`
export const spotify_placeholder = `${baseURL}/images/spotify-logo.png`
export const local_placeholder = `${baseURL}/images/local.png`
export const listen_moe_placeholder = `${baseURL}/images/listen-moe-logo.png`
export const newgrounds_placeholder = `${baseURL}/images/ng-logo.png`
export const twitter_placeholder = `${baseURL}/images/twitter-logo.png`

export default exports as typeof import("./constants")
