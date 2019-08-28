//@ts-check

const Discord = require("discord.js")
const path = require("path")

const passthrough = require("../passthrough")
let { client, reloader } = passthrough

let utils = require("./utilities.js")
reloader.useSync("./modules/utilities.js", utils)

let messages, ranges, users

function refresh() {
	return Promise.all([
		utils.sql.all("SELECT id, dates, users, message, type, demote FROM StatusMessages"),
		utils.sql.all("SELECT label, startmonth, startday, endmonth, endday FROM StatusRanges"),
		utils.sql.all("SELECT label, userID FROM StatusUsers")
	]).then(([_messages, _ranges, _users]) => {
		messages = _messages
		ranges = _ranges
		users = _users
	})
}

client.once("prefixes", async (prefixes, statusPrefix) => {
	await refresh()

	/** @return {Array<String>} */
	function getCurrentGroups() {
		return users.filter(o => o.userID == client.user.id).map(o => o.label)
	}

	function getCurrentRanges() {
		let date = new Date()
		let currentMonth = date.getMonth()+1
		let currentDate = date.getDate()
		return ranges.filter(range => {
			// Four types of matching:
			// 1. If months specified and dates specified, convert DB data to timestamp and compare
			// 2. If months specified and dates not, check month within range
			// 3. If dates specified and months not, check dates within range
			// 4. If nothing specified, date is always within range.
			let monthSpecified = !(range.startmonth == null || range.endmonth == null)
			let dateSpecified = !(range.startday == null || range.endday == null)
			if (monthSpecified && dateSpecified) {
				// Case 1
				let startDate = new Date()
				startDate.setHours(0, 0, 0)
				startDate.setMonth(range.startmonth-1, range.startday)
				let endDate = new Date()
				endDate.setHours(0, 0, 0)
				endDate.setMonth(range.endmonth-1, range.endday)
				if (endDate < startDate) endDate.setFullYear(startDate.getFullYear()+1)
				endDate.setTime(endDate.getTime() + 1000*60*60*24)
				return startDate <= date && endDate > date
			} else if (monthSpecified) {
				// Case 2
				return range.startmonth <= currentMonth && range.endmonth >= currentMonth
			} else if (dateSpecified) {
				// Case 3
				return range.startday <= currentDate && range.endday >= currentDate
			} else {
				// Case 4
				return true
			}
		}).map(range => range.label)
	}

	function getMatchingMessages() {
		let currentRanges = getCurrentRanges()
		let groupsBotIsIn = getCurrentGroups()
		let regional = []
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
		let choices = getMatchingMessages()
		//console.log(JSON.stringify(choices, null, 4))
		let choice = utils.arrayRandom(choices)
		if (choice) {
			client.user.setActivity(`${choice.message} | ${statusPrefix}help`, {type: choice.type, url: "https://www.twitch.tv/papiophidian/"})
			//console.log(`Set status: "${choice.message}" (${choice.type})`)
		} else {
			console.error("Warning: no status messages available!")
		}
	}

	update()

	setInterval(() => update(), 5*60*1000)
	setInterval(() => refresh(), 15*60*1000)

	// gross hack
	utils.updateStatus = async function() {
		await refresh()
		update()
	}
})
