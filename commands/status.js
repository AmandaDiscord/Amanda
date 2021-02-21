// @ts-check

const passthrough = require("../passthrough")
const { client, config, constants, reloader, ipc, commands, internalEvents } = passthrough

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

const refreshTime = 15 * 60 * 1000
const updateTime = 5 * 60 * 1000

let messages, ranges, users, prefix, updateInterval
let enqueued

const activities = {
	"PLAYING": 0,
	"STREAMING": 1,
	"LISTENING": 2,
	"WATCHING": 3,
	"COMPETING": 5
}

/**
 * @param {number} duration
 * @param {string} message
 */
function startAnnouncement(duration, message) {
	clearInterval(updateInterval)
	/** @type {{ name: string, type: 0 | 1 | 2 | 3 | 5, url: string }} */
	const data = {
		name: message,
		type: 0,
		url: "https://www.twitch.tv/papiophidian/"
	}
	passthrough.workers.gateway.statusUpdate(data)
	enqueued = setTimeout(() => {
		update()
		updateInterval = setInterval(() => update(), updateTime)
	}, duration)
}

ipc.replier.addReceivers([
	["apply_announcement_PRESENCE_ANNOUNCEMENT", {
		op: "PRESENCE_ANNOUNCEMENT",
		fn: ({ duration, message }) => {
			startAnnouncement(duration, message)
		}
	}]
])

commands.assign([
	{
		usage: "<duration: number> <message>",
		description: "Make an announcement with the client activity",
		category: "admin",
		aliases: ["announce"],
		examples: ["announce 60000 sub to papiophidian on twitch | &help"],
		async process(msg, suffix) {
			const allowed = await utils.sql.hasPermission(msg.author, "eval")
			if (!allowed) return
			if (enqueued) {
				clearTimeout(enqueued)
				enqueued = undefined
			}
			const args = suffix.split(" ")
			if (!args[0]) return msg.channel.send("You need to provide a duration in ms and a message to announce")
			const dur = args[0]
			const duration = utils.parseDuration(dur)
			if (isNaN(duration) || duration === 0) return msg.channel.send("That's not a valid duration")
			if (!args[1]) return msg.channel.send("You need to provide a message to announce")
			const message = suffix.substring(args[0].length + 1)
			// The announcement gets beamed to all shards including us, so don't trigger a change here since it'll come in anyway.
			ipc.replier.sendPresenceAnnouncement(duration, message)
			msg.channel.send(`New presence set for ${utils.shortTime(duration, "ms").trim()}: \`${message}\``)
		}
	}
])

async function refresh() {
	const [_messages, _ranges, _users] = await Promise.all([
		utils.sql.all("SELECT id, dates, users, message, type, demote FROM status_messages"),
		utils.sql.all("SELECT label, start_month, start_day, end_month, end_day FROM status_ranges"),
		utils.sql.all("SELECT label, user_id FROM status_users")
	])
	messages = _messages
	ranges = _ranges
	users = _users
}

internalEvents.once("prefixes", async (prefixes, statusPrefix) => {
	await refresh()

	prefix = statusPrefix

	update()

	updateInterval = setInterval(() => update(), updateTime)
	setInterval(() => refresh(), refreshTime)
})

/** @return {Array<string>} */
function getCurrentGroups() {
	return users.filter(o => o.user_id == client.user.id).map(o => o.label)
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
		const monthSpecified = !(range.start_month == null || range.end_month == null)
		const dateSpecified = !(range.start_day == null || range.end_day == null)
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
	const regional = []
	let constant = []
	messages.forEach(message => {
		if (message.dates && !currentRanges.includes(message.dates)) return false // criteria exists and didn't match
		if (message.users && !groupsBotIsIn.includes(message.users)) return false // criteria exists and didn't match
		if (message.dates) regional.push(message) // this is regional, it already matched, so it gets priority
		if (!message.dates) constant.push(message) // this isn't regional, so it doesn't get priority
	})
	if (regional.length) constant = constant.filter(message => message.demote == 0) // if regional statuses are available, filter out demotable non-regional. (demote has no effect on regional)
	return regional.concat(constant)
}

function update() {
	const choices = getMatchingMessages()
	// console.log(JSON.stringify(choices, null, 4))
	const choice = utils.arrayRandom(choices)
	if (choice) {
		let type
		if (typeof choice.type === "string") type = activities[choice.type]
		else type = choice.type
		const data = {
			name: `${choice.message} | ${prefix}help | ${config.cluster_id}`,
			type: type,
			url: "https://www.twitch.tv/papiophidian/"
		}
		passthrough.workers.gateway.statusUpdate(data)
	} else {
		console.error("Warning: no status messages available!")
	}
}
