// @ts-check

const fetchdefault = require("node-fetch").default
/** @type {fetchdefault} */
// @ts-ignore
const fetch = require("node-fetch")

const { analytics, ipc, reloader, config } = require("../../passthrough")

let timeout
let cancelled = false

const topBaseURL = "https://top.gg/api"
const botsonBaseURL = "https://bots.ondiscord.xyz/bot-api"
const boatsBaseURL = "https://discord.boats/api"
const dblBaseURL = "https://discordbotlist.com/api/v1"
const botsggBaseURL = "https://discord.bots.gg/api/v1"

const clientID = "405208699313848330"

async function report() {
	const stats = await ipc.replier.requestGetStats()
	const shardCount = [...ipc.shardsPerCluster.values()].reduce((acc, cur) => acc += cur, 0)
	const errors = []
	await Promise.all([
		analytics.sendReport({ servers: stats.guilds, channels: stats.channels, users: stats.users, ram_used: stats.combinedRam, received_messages: 0, sent_messages: 0 }).catch(errors.push),
		fetch(`${topBaseURL}/bots/${clientID}/stats`, { method: "POST", headers: { Authorization: config.top_api_key }, body: JSON.stringify({ server_count: stats.guilds, shard_count: shardCount }) }).catch(errors.push),
		fetch(`${botsonBaseURL}/bots/${clientID}/guilds`, { method: "POST", headers: { Authorization: config.botson_api_key }, body: JSON.stringify({ guildCount: stats.guilds }) }).catch(errors.push),
		fetch(`${boatsBaseURL}/bot/${clientID}`, { method: "POST", headers: { Authorization: config.boats_api_key }, body: JSON.stringify({ server_count: stats.guilds }) }).catch(errors.push),
		fetch(`${dblBaseURL}/bots/${clientID}/stats`, { method: "POST", headers: { Authorization: config.dbl_api_key }, body: JSON.stringify({ guilds: stats.guilds, users: stats.users, voice_connections: stats.connections }) }).catch(errors.push),
		fetch(`${botsggBaseURL}/bots/${clientID}/stats`, { method: "POST", headers: { Authorization: config.botsgg_api_key }, body: JSON.stringify({ guildCount: stats.guilds, shardCount: shardCount }) })
	])
	if (errors.length > 0) Promise.reject(errors)
}

async function reportAndSetTimeout() {
	if (cancelled) return
	await report().catch(() => console.log("Public apis suck but we're continuing anyway"))
	timeout = setTimeout(reportAndSetTimeout, 10*60*1000)
}

ipc.waitForClientID().then(clusterID => {
	if (clusterID === "pencil") {
		console.log("Stat reporting active")
		setTimeout(() => {
			reportAndSetTimeout()
		}, 1000)
	} else {
		console.log("Stat reporting would be active, but wrong cluster ID")
	}
})

reloader.reloadEvent.once("statreporting.js", () => {
	cancelled = true
	clearTimeout(timeout)
})
