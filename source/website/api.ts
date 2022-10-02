import util from "util"

import passthrough from "../passthrough"
const { config, liveUserID, sync } = passthrough

const utils: typeof import("./util") = sync.require("./util")
const orm: typeof import("../utils/orm") = sync.require("../utils/orm")

function getTimeoutForStatsPosting() {
	const mins10inms = 1000 * 60 * 10
	const currently = Date.now()
	return { now: currently, remaining: mins10inms - (currently % mins10inms) }
}

let statsTimeout: NodeJS.Timeout

function setTimeoutForStats() {
	const dateExpected = getTimeoutForStatsPosting()
	statsTimeout = setTimeout(() => onStatsPosting(dateExpected.now + dateExpected.remaining), dateExpected.remaining + 10000)
}

const okStatusCodes = [200, 204]

async function onStatsPosting(time: number) {
	if (config.is_dev_env) return
	const stats = await orm.db.select("stat_logs", { time, id: liveUserID })
	if (!stats.length) return

	const totalStats = {
		channels: 0,
		guilds: 0,
		ram_usage_kb: 0,
		users: 0,
		voice_connections: 0
	}

	for (const key of Object.keys(totalStats)) {
		const k: keyof typeof totalStats = key as keyof typeof totalStats
		totalStats[k] = stats.reduce((_, cur) => cur[k], 0)
	}

	const onResponse = async (response: Response) => {
		if (!okStatusCodes.includes(response.status)) {
			utils.error(`Response from posting api was a non-ok status: { status: ${response.status}, url: ${response.url} }`)
			utils.error(await response.text())
		}
	}

	fetch(`https://bots.ondiscord.xyz/bot-api/bots/${liveUserID}/guilds`, {
		method: "POST",
		headers: {
			Authorization: config.botson_api_key,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ guildCount: totalStats.guilds })
	}).then(onResponse).catch(e => utils.error(`Bots on discord stats api threw an Error:\n${util.inspect(e, false, Infinity, true)}`))

	fetch(`https://discordbotlist.com/api/v1/bots/${liveUserID}/stats`, {
		method: "POST",
		headers: {
			Authorization: config.dbl_api_key,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ guilds: totalStats.guilds, users: totalStats.users, voice_connections: totalStats.voice_connections })
	}).then(onResponse).catch(e => utils.error(`discord bot list stats api threw an Error:\n${util.inspect(e, false, Infinity, true)}`))

	fetch(`https://discord.bots.gg/api/v1/bots/${liveUserID}/stats`, {
		method: "POST",
		headers: {
			Authorization: config.botsgg_api_key,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ shardCount: config.total_shards, guildCount: totalStats.guilds })
	}).then(onResponse).catch(e => utils.error(`discord bots gg stats api threw an Error:\n${util.inspect(e, false, Infinity, true)}`))

	fetch(`https://top.gg/api/bots/${liveUserID}/stats`, {
		method: "POST",
		headers: {
			Authorization: config.top_api_key,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ shard_count: config.total_shards, server_count: totalStats.guilds })
	}).then(onResponse).catch(e => utils.error(`top gg stats api threw an Error:\n${util.inspect(e, false, Infinity, true)}`))

	fetch(`https://api.discordextremelist.xyz/v2/bot/${liveUserID}/stats`, {
		method: "POST",
		headers: {
			Authorization: config.del_api_key,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ shardCount: config.total_shards, guildCount: totalStats.guilds })
	}).then(onResponse).catch(e => utils.error(`discord extreme list stats api threw an Error:\n${util.inspect(e, false, Infinity, true)}`))

	fetch(`https://discords.com/bots/api/bot/${liveUserID}`, {
		method: "POST",
		headers: {
			Authorization: config.discords_api_key,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ server_count: totalStats.guilds })
	}).then(onResponse).catch(e => utils.error(`discords stats api threw an Error:\n${util.inspect(e, false, Infinity, true)}`))

	const cheweyBody = JSON.stringify({
		servers: totalStats.guilds,
		users: totalStats.users,
		channels: totalStats.channels,
		ram_used: totalStats.ram_usage_kb * 1024, // chewey API expects bytes
		received_messages: 0,
		sent_messages: 0
	})

	fetch(`https://api.chewey-bot.top/analytics/post`, {
		method: "POST",
		headers: {
			Authorization: config.chewey_api_key,
			"Content-Type": "application/json",
			"Content-Length": Buffer.byteLength(cheweyBody).toString()
		},
		body: cheweyBody
	}).then(onResponse).catch(e => utils.error(`chewey api threw an Error:\n${util.inspect(e, false, Infinity, true)}`))

	setTimeoutForStats()
}

setTimeoutForStats()
