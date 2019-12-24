// @ts-check

const {analytics, ipc} = require("../passthrough")

let cancelled = false

async function report() {
	const stats = await ipc.router.requestStats()
	console.log("Sending report:", stats)
	return analytics.sendReport({
		servers: stats.guilds,
		channels: stats.channels,
		users: stats.users,
		ram_used: stats.combinedRam,
		received_messages: 0,
		sent_messages: 0
	})
}

async function reportAndSetTimeout() {
	if (cancelled) return
	await report()
	setTimeout(reportAndSetTimeout, 10*60*1000)
}

if (ipc.clientID === "405208699313848330") {
	setTimeout(() => {
		reportAndSetTimeout()
	}, 1000)
}

module.exports = [
	{cancel: true, code: () => {
		cancelled = true
	}}
]
