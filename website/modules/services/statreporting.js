// @ts-check

const fetchdefault = require("node-fetch").default
/** @type {fetchdefault} */
// @ts-ignore
const fetch = require("node-fetch")

const { analytics, ipc, reloader, config, clientID } = require("../../passthrough")

let timeout
let cancelled = false // Cancelled on Twitter

const topBaseURL = "https://top.gg/api"
const botsonBaseURL = "https://bots.ondiscord.xyz/bot-api"
const boatsBaseURL = "https://discord.boats/api"
const dblBaseURL = "https://discordbotlist.com/api/v1"
const botsggBaseURL = "https://discord.bots.gg/api/v1"

async function report() {
	const stats = await ipc.replier.requestGetStats()
	const shardCount = ipc.replier.getShardsForClient(clientID).length
	const errors = []
	await Promise.all([
		analytics.sendReport({ servers: stats.guilds, channels: stats.channels, users: stats.users, ram_used: stats.combinedRam, received_messages: 0, sent_messages: 0 }).catch(errors.push),
		fetch(`${topBaseURL}/bots/${clientID}/stats`, { method: "POST", headers: { "content-type": "application/json", Authorization: config.top_api_key }, body: JSON.stringify({ server_count: stats.guilds, shard_count: shardCount }) }).catch(errors.push),
		fetch(`${botsonBaseURL}/bots/${clientID}/guilds`, { method: "POST", headers: { "content-type": "application/json", Authorization: config.botson_api_key }, body: JSON.stringify({ guildCount: stats.guilds }) }).catch(errors.push),
		fetch(`${boatsBaseURL}/bot/${clientID}`, { method: "POST", headers: { "content-type": "application/json", Authorization: config.boats_api_key }, body: JSON.stringify({ server_count: stats.guilds }) }).catch(errors.push),
		fetch(`${dblBaseURL}/bots/${clientID}/stats`, { method: "POST", headers: { "content-type": "application/json", Authorization: config.dbl_api_key }, body: JSON.stringify({ guilds: stats.guilds, users: stats.users, voice_connections: stats.connections }) }).catch(errors.push),
		fetch(`${botsggBaseURL}/bots/${clientID}/stats`, { method: "POST", headers: { "content-type": "application/json", Authorization: config.botsgg_api_key }, body: JSON.stringify({ guildCount: stats.guilds, shardCount: shardCount }) })
	])
	if (errors.length > 0) Promise.reject(errors)
	console.log("Stats sent")
}

async function reportAndSetTimeout() {
	if (cancelled) return
	if (ipc.replier.getIdealClient() != clientID) console.log("Live client not connected. Skipping stat loop.")
	else await report().catch(() => console.log("Public apis suck but we're continuing anyway"))
	timeout = setTimeout(reportAndSetTimeout, 10*60*1000)
}

ipc.waitForClientID().then(() => {
	console.log("Stat reporting active")
	setTimeout(() => {
		reportAndSetTimeout()
	}, 1000)
})

reloader.reloadEvent.once("statreporting.js", () => {
	cancelled = true
	clearTimeout(timeout)
})
