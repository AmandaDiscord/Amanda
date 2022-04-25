import passthrough from "../passthrough"
const { client, config, sync, constants } = passthrough

const orm = sync.require("../utils/orm") as typeof import("../utils/orm")
const arr = sync.require("../utils/array") as typeof import("../utils/array")
const logger = sync.require("../utils/logger") as typeof import("../utils/logger")

const refreshTime = 15 * 60 * 1000
const updateTime = 5 * 60 * 1000

let messages: Array<{ id: number; dates: string; users: string; message: string; type: number; demote: number }>, ranges: Array<{ label: string; start_month: number; start_day: number; end_month: number; end_day: number; }>, users: Array<{ label: string; user_id: string; }>, prefix: string, updateInterval: NodeJS.Timeout
let enqueued: NodeJS.Timeout

let started = false
if (client.ready) started = true

sync.addTemporaryListener(sync.events, __filename, () => {
	clearTimeout(enqueued)
	clearInterval(updateInterval)
})

const activities = {
	"PLAYING": 0 as const,
	"STREAMING": 1 as const,
	"LISTENING": 2 as const,
	"WATCHING": 3 as const,
	"COMPETING": 5 as const
}

sync.addTemporaryListener(client, "ready", () => {
	if (started) return
	started = true
	refresh().then(() => {
		update()
		updateInterval = setInterval(() => update(), updateTime)
		setInterval(() => refresh(), refreshTime)
	})
}, "once")

function startAnnouncement(duration: number, message: string) {
	clearInterval(updateInterval)
	clearTimeout(enqueued)
	const data = {
		activities: [
			{
				name: `${message} | /help | ${config.cluster_id}`,
				type: 0,
				url: "https://www.twitch.tv/papiophidian/"
			}
		],
		status: "online"
	}
	passthrough.requester.request(constants.GATEWAY_WORKER_CODES.STATUS_UPDATE, data, (d) => passthrough.gateway.postMessage(d))
	enqueued = setTimeout(() => {
		update()
		updateInterval = setInterval(() => update(), updateTime)
	}, duration)
}

async function refresh() {
	const [_messages, _ranges, _users] = await Promise.all([
		orm.db.select("status_messages", undefined, { select: ["id", "dates", "users", "message", "type", "demote"] }),
		orm.db.select("status_ranges", undefined, { select: ["label", "start_month", "start_day", "end_month", "end_day"] }),
		orm.db.select("status_users", undefined, { select: ["label", "user_id"] })
	])
	messages = _messages
	ranges = _ranges
	users = _users
}

function getCurrentGroups(): Array<string> {
	return users.filter(o => o.user_id == client.user!.id).map(o => o.label)
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
	const regional = [] as typeof messages
	let constant = [] as typeof messages
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
	const choice = arr.random(choices)
	if (choice) {
		let type: number
		if (typeof choice.type === "string") type = activities[choice.type]
		else type = choice.type
		const data = {
			activities: [
				{
					name: `${choice.message} | /help | ${config.cluster_id}`,
					type: type,
					url: "https://www.twitch.tv/papiophidian/"
				}
			],
			status: type === activities.STREAMING ? "streaming" : "online"
		}
		passthrough.requester.request(constants.GATEWAY_WORKER_CODES.STATUS_UPDATE, data, (d) => passthrough.gateway.postMessage(d))
	} else {
		logger.error("Warning: no status messages available!")
	}
}

export = startAnnouncement
