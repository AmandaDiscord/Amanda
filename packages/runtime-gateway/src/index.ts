import "@amanda/logger"

import fs = require("fs")
import path = require("path")

import { Client } from "cloudstorm"

import confprovider = require("@amanda/config")
import sql = require("@amanda/sql")
import WebsiteConnector = require("@amanda/web-internal")
import REPLProvider = require("@amanda/repl")
import sharedUtils = require("@amanda/shared-utils")
import redis = require("@amanda/redis")

import type { GatewayVoiceState } from "discord-api-types/v10"

const toSessionsJSON = path.join(__dirname, "../sessions.json")

type SQL = typeof sql

let alreadyStartedUpdates = false
let shardInfoChanged = false
let alreadyWrote = false
const _oldShards = confprovider.config.shards
const _oldTotalShards = confprovider.config.total_shards

const webconnector = new WebsiteConnector("/gateway")
const clientID = Buffer.from(confprovider.config.current_token.split(".")[0], "base64").toString("utf8")
const client = new Client(confprovider.config.current_token, {
	shards: confprovider.config.shards,
	totalShards: confprovider.config.total_shards,
	reconnect: true,
	intents: ["GUILD_VOICE_STATES", "GUILDS"],
	ws: {
		compress: false,
		encoding: "json"
	}
})

confprovider.addCallback(() => {
	if (!confprovider.config.shards.every((item, index) => _oldShards[index] === item)) shardInfoChanged = true
	if (confprovider.config.total_shards !== _oldTotalShards) shardInfoChanged = true
})

async function updateVoiceState(state: GatewayVoiceState, modifyIndex = true) {
	if (!state.guild_id) return
	let promise: Promise<void>
	if (state.channel_id === null) {
		const old = await redis.GET<GatewayVoiceState>("voice", state.user_id)
		promise = redis.DEL("voice", state.user_id, old?.channel_id && modifyIndex ? `vcs.${old.channel_id}` : undefined)
	} else promise = redis.SET("voice", state.user_id, state, modifyIndex ? `vcs.${state.channel_id}` : undefined)
	Promise.all([
		promise,
		state.channel_id ? redis.SADD(`${state.guild_id}.channels`, state.channel_id) : Promise.resolve(void 0)
	])
}

(async () => {
	webconnector.on("open", () => {
		console.log("Sent shard list to website")
		webconnector.send({ op: 0, t: "SHARD_LIST", d: confprovider.config.shards }).catch(console.error)
	})

	await sql.connect()
	await redis.connect()
	void new REPLProvider({ client, webconnector, confprovider, sql, startAnnouncement })
	client.on("debug", d => console.log(d))
	client.on("error", e => console.error(e))
	client.on("event", async packet => {

		switch (packet.t) {

		case "VOICE_STATE_UPDATE":
			await updateVoiceState(packet.d)
			break

		case "GUILD_CREATE":
			redis.SMEMBERS(`${packet.d.id}.channels`).then(async vcs => {
				await redis.SREM(`${packet.d.id}.channels`, vcs) // remove all old voice channels as new ones will be populated
				Promise.all([
					redis.SADD("guilds", packet.d.id), // Our SADD removes dupes
					redis.SADD(`${packet.d.id}.channels`, packet.d.channels.filter(c => c.type === 2).map(c => c.id)), // add voice channels to index
					...(packet.d.voice_states ?? []).map(state => updateVoiceState(state, false)) // add voice states but dont add to index sequentually. Add all from each vc in 1 command below
				])

				const uniqueActiveVCs = new Map<string, Array<string>>()
				for (const state of packet.d.voice_states) {
					if (!uniqueActiveVCs.has(state.channel_id!)) uniqueActiveVCs.set(state.channel_id!, [state.user_id])
					else uniqueActiveVCs.get(state.channel_id!)!.push(state.user_id)
				}
				for (const [channel, users] of uniqueActiveVCs) redis.SADD(`vcs.${channel}`, users)
			})
			return // do not send this

		case "GUILD_DELETE":
			if (packet.d.unavailable) return // specifically do not send this event as it's not used by Amanda
			Promise.all([
				redis.SMEMBERS(`${packet.d.id}.channels`), // get all old vcs to delete states
				redis.SREM("guilds", packet.d.id) // remove from guilds index
			]).then(async ([vcs]) => {
				redis.SREM(`${packet.d.id}.channels`, vcs, true) // we got all old vcs. Delete them from the index
				const members = await Promise.all(vcs.map(vc => redis.SMEMBERS(`vcs.${vc}`))) // Get all voice states for each voice channel if any
				for (let index = 0; index < members.length; index++) {
					redis.SREM(`vcs.${vcs[index]}`, members[index], true) // remove members from voice state index and drop it for channel
					for (const member of members[index]) redis.DEL("voice", member) // remove data
				}
			})
			return // do not send this

		case "CHANNEL_DELETE":
			if (packet.d.type !== 2) return // do not send this
			if (!packet.d.guild_id) return // do not send this
			redis.SREM(`${packet.d.guild_id}.channels`, packet.d.id)
			redis.SMEMBERS(`vcs.${packet.d.id}`).then(members => {
				Promise.all([
					redis.SREM(`vcs.${packet.d.id}`, members, true),
					...members.map(m => redis.DEL("voice", m))
				])
			})
			return // do not send this

		case "READY":
		case "RESUMED":
			if (!alreadyStartedUpdates) {
				alreadyStartedUpdates = true
				await refresh()
				update()

				updateInterval = setInterval(() => update(), updateTime)
				setInterval(() => refresh(), refreshTime)
			}
		}

		webconnector.send(packet)
	})

	let stats: fs.Stats | undefined
	try {
		stats = await fs.promises.stat(toSessionsJSON)
	} catch {
		stats = void 0
	}

	await client.fetchConnectInfo()

	if (stats && stats.mtimeMs >= (Date.now() - (1000 * 60 * 1.5))) {
		const data = await fs.promises.readFile(toSessionsJSON, { encoding: "utf8" })

		let sessions
		try {
			sessions = JSON.parse(data)
		} catch {
			sessions = {}
		}

		client.shardManager.spawn()
		for (const sid of Object.keys(sessions)) {
			const shard = Object.entries(client.shardManager.shards).find(e => e[0] == sid)?.[1]

			if (shard) {
				shard.connector.sessionId = sessions[sid][0]
				shard.connector.resumeAddress = sessions[sid][1]
				shard.connector.betterWs.address = sessions[sid][1] ?? shard.connector.betterWs.address
				shard.connector.seq = sessions[sid][2]

				console.log(`Setup previous resume info from session JSON for shard ${shard.id}`)
			}
		}
	} else await client.connect()

	webconnector.on("message", data => {
		const parsed = data

		if (parsed.t === "SEND_MESSAGE" && parsed.d && typeof parsed.d.shard_id === "number") {
			const shard = Object.entries(client.shardManager.shards).find(e => e[0] == parsed.d.shard_id)?.[1]
			if (!shard) return console.warn(`Shard ${parsed.d.shard_id} doesn't exist in this cluster`)
			delete parsed.d.shard_id
			delete parsed.t
			shard.connector.betterWs.sendMessage(parsed)
		}
	})
})()

process.stdin.resume()

function exitHandler(...params: Array<unknown>) {
	if (shardInfoChanged) {
		try {
			fs.unlinkSync(toSessionsJSON)
		} catch {
			void 0
		}
		console.warn(...params)
		return
	}
	if (alreadyWrote) return
	alreadyWrote = true

	console.warn(...params)
	const data = {}
	for (const shard of Object.values(client.shardManager.shards)) {
		data[shard.id] = [shard.connector.sessionId, shard.connector.resumeAddress, shard.connector.seq]
	}

	fs.writeFileSync(toSessionsJSON, JSON.stringify(data))
	console.log("Wrote session data to fs to restore later")
	process.exit()
}


// statuses


const refreshTime = 15 * 60 * 1000
const updateTime = 5 * 60 * 1000

let messages: Array<import("@amanda/sql/src/orm").InferModelDef<SQL["orm"]["tables"]["status_messages"]>>,
	ranges: Array<import("@amanda/sql/src/orm").InferModelDef<SQL["orm"]["tables"]["status_ranges"]>>,
	users: Array<import("@amanda/sql/src/orm").InferModelDef<SQL["orm"]["tables"]["status_users"]>>,
	updateInterval: NodeJS.Timeout | undefined

let enqueued: NodeJS.Timeout | undefined

const activities = {
	"PLAYING": 0 as const,
	"STREAMING": 1 as const,
	"LISTENING": 2 as const,
	"WATCHING": 3 as const,
	"CUSTOM": 4 as const,
	"COMPETING": 5 as const
}

function startAnnouncement(duration: number, message: string) {
	if (updateInterval) clearInterval(updateInterval)
	if (enqueued) clearTimeout(enqueued)

	updateInterval = void 0
	enqueued = void 0

	client.shardManager.presenceUpdate({
		activities: [{
			name: "Announcement",
			state: message,
			type: 4,
			url: "https://www.twitch.tv/papiophidian/"
		}]
	})

	enqueued = setTimeout(() => {
		update()
		updateInterval = setInterval(() => update(), updateTime)
	}, duration)
}

async function refresh() {
	const [_messages, _ranges, _users] = await Promise.all([
		sql.orm.select("status_messages", void 0, { select: ["id", "dates", "users", "message", "type", "demote"] }),
		sql.orm.select("status_ranges", void 0, { select: ["label", "start_month", "start_day", "end_month", "end_day"] }),
		sql.orm.select("status_users", void 0, { select: ["label", "user_id"] })
	])

	messages = _messages
	ranges = _ranges
	users = _users
}

function getCurrentGroups(): Array<string> {
	return users.filter(o => o.user_id === clientID).map(o => o.label)
}

function getCurrentRanges() {
	const date = new Date()
	const currentMonth = date.getMonth() + 1
	const currentDate = date.getDate()
	return ranges.filter(range => {
		// Four types of matching:
		// 1. If months specified and dates specified, convert DB data to timestamp and compare
		// 2. If months specified and dates not, check month within range
		// 3. If dates specified and months not, check dates within range
		// 4. If nothing specified, date is always within range.
		const monthSpecified = !(range.start_month === null || range.end_month === null)
		const dateSpecified = !(range.start_day === null || range.end_day === null)
		if (monthSpecified && dateSpecified) {
			// Case 1
			const startDate = new Date()
			startDate.setHours(0, 0, 0)
			startDate.setMonth(range.start_month - 1, range.start_day)
			const endDate = new Date()
			endDate.setHours(0, 0, 0)
			endDate.setMonth(range.end_month - 1, range.end_day)
			if (endDate < startDate) endDate.setFullYear(startDate.getFullYear() + 1)
			endDate.setTime(endDate.getTime() + 1000 * 60 * 60 * 24)
			return startDate <= date && endDate > date
		} else if (monthSpecified) {
			// Case 2
			return range.start_month <= currentMonth && range.end_month >= currentMonth
		} else if (dateSpecified) {
			// Case 3
			return range.start_day <= currentDate && range.end_day >= currentDate
		} else {
			// Case 4
			return true
		}
	}).map(range => range.label)
}

function getMatchingMessages() {
	const currentRanges = getCurrentRanges()
	const groupsBotIsIn = getCurrentGroups()
	const regional: typeof messages = []
	let constant: typeof messages = []
	messages.forEach(message => {
		if (message.dates && !currentRanges.includes(message.dates)) return false // criteria exists and didn't match
		if (message.users && !groupsBotIsIn.includes(message.users)) return false // criteria exists and didn't match
		if (message.dates) regional.push(message) // this is regional, it already matched, so it gets priority
		if (!message.dates) constant.push(message) // this isn't regional, so it doesn't get priority
	})
	if (regional.length) constant = constant.filter(message => message.demote === 0) // if regional statuses are available, filter out demotable non-regional. (demote has no effect on regional)
	return regional.concat(constant)
}

function update() {
	const choices = getMatchingMessages()
	// console.log(JSON.stringify(choices, null, 4))
	const choice = sharedUtils.arrayRandom(choices)

	if (choice) {
		const type: number = activities[choice.type] ?? choice.type ?? 0

		const message = `${choice.message} | /help | ${confprovider.config.cluster_id}`

		client.shardManager.presenceUpdate({
			activities: [{
				name: type === 4 ? "Custom" : message,
				state: type === 4 ? message : undefined,
				type: type,
				url: "https://www.twitch.tv/papiophidian/"
			}]
		})
	} else console.error("Warning: no status messages available!")
}

process.on("exit", exitHandler)
process.on("SIGINT", exitHandler)
process.on("SIGUSR1", exitHandler)
process.on("SIGUSR2", exitHandler)
