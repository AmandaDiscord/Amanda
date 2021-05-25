// @ts-check

const c = require("centra")

const { analytics, ipc, sync, config, clientID } = require("../../passthrough")

let timeout
let cancelled = false // Cancelled on Twitter

const topBaseURL = "https://top.gg/api"
const botsonBaseURL = "https://bots.ondiscord.xyz/bot-api"
const boatsBaseURL = "https://discord.boats/api"
const dblBaseURL = "https://discordbotlist.com/api/v1"
const botsggBaseURL = "https://discord.bots.gg/api/v1"
const delBaseURL = "https://api.discordextremelist.xyz/v2"

async function report() {
	const stats = await ipc.replier.requestGetStats()
	const shardCount = ipc.replier.getShardsForClient(clientID).length
	const errors = []
	await Promise.all([
		analytics.sendReport({ servers: stats.guilds, channels: stats.channels, users: stats.users, ram_used: stats.combinedRam, received_messages: 0, sent_messages: 0 }).catch(errors.push),
		c(`${topBaseURL}/bots/${clientID}/stats`, "post").header("Authorization", config.top_api_key).body({ server_count: stats.guilds, shard_count: shardCount }, "json").send().catch(errors.push),
		c(`${botsonBaseURL}/bots/${clientID}/guilds`, "post").header("Authorization", config.botson_api_key).body({ guildCount: stats.guilds }, "json").send().catch(errors.push),
		c(`${boatsBaseURL}/bot/${clientID}`, "post").header("Authorization", config.boats_api_key).body({ server_count: stats.guilds }, "json").send().catch(errors.push),
		c(`${dblBaseURL}/bots/${clientID}/stats`, "post").header("Authorization", config.dbl_api_key).body({ guilds: stats.guilds, users: stats.users, voice_connections: stats.connections }, "json").send().catch(errors.push),
		c(`${botsggBaseURL}/bots/${clientID}/stats`, "post").header("Authorization", config.botsgg_api_key).body({ guildCount: stats.guilds, shardCount: shardCount }, "json").send().catch(errors.push),
		c(`${delBaseURL}/bot/${clientID}/stats`, "post").header("Authorization", config.del_api_key).body({ guildCount: stats.guilds, shardCount: shardCount }, "json").send().catch(errors.push)
	])
	if (errors.length > 0) Promise.reject(errors)
	console.log("Stats sent")
}

async function reportStats() {
	if (cancelled) return
	if (ipc.replier.getIdealClient() != clientID) console.log("Live client not connected. Skipping stat loop.")
	else await report().catch(errors => console.log(`Public apis suck but we're continuing anyway\n${errors}`))
}

ipc.waitForClientID().then(() => {
	console.log("Stat reporting active")
	if (timeout) {
		clearInterval(timeout)
		timeout = null
	}
	timeout = setInterval(() => {
		reportStats()
	}, 1000 * 60 * 10)
})

sync.events.once(__filename, () => {
	cancelled = true
	clearInterval(timeout)
	timeout = null
})
