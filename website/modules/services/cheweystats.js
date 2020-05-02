// @ts-check

const { analytics, ipc, reloader } = require("../../passthrough")

let cancelled = false

async function report() {
	const stats = await ipc.replier.requestGetStats()
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
	await report().catch(() => {
		console.log("chewey your api sucks but we're continuing anyway")
	})
	setTimeout(reportAndSetTimeout, 10*60*1000)
}

ipc.waitForClientID().then(clientID => {
	if (clientID === "405208699313848330") {
		console.log("Stat reporting active")
		setTimeout(() => {
			reportAndSetTimeout()
		}, 1000)
	} else {
		console.log("Stat reporting would be active, but wrong client ID")
	}
})

reloader.reloadEvent.once("cheweystats.js", () => {
	cancelled = true
})
