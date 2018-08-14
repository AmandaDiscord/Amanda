module.exports = function(passthrough) {
	const { Discord, client, utils, reloadEvent } = passthrough;

	sendStatsTimeout = setTimeout(sendStatsTimeoutFunction, 1000*60*60 - (Date.now() % (1000*60*60)));
	function sendStatsTimeoutFunction() {
		sendStats();
		sendStatsTimeout = setTimeout(sendStatsTimeoutFunction, 1000*60*60);
	}

	reloadEvent.once(__filename, () => {
		clearTimeout(sendStatsTimeout);
	});

	async function sendStats(msg) {
		console.log("Sending stats...");
		let now = Date.now();
		let myid = client.user.id;
		let ramUsageKB = Math.floor(((process.memoryUsage().rss - (process.memoryUsage().heapTotal - process.memoryUsage().heapUsed)) / 1024))
		let users = client.users.size;
		let guilds = client.guilds.size;
		let channels = client.channels.size;
		let voiceConnections = client.voiceConnections.size;
		let uptime = process.uptime();
		await utils.sql.all("INSERT INTO StatLogs VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [now, myid, ramUsageKB, users, guilds, channels, voiceConnections, uptime]);
		if (msg) msg.react("👌");
		console.log("Sent stats.", new Date().toUTCString());
	}

	return {
		"forcestatupdate": {
			usage: "",
			description: "",
			aliases: ["forcestatupdate"],
			category: "dev",
			process: function(msg) {
				sendStats(msg);
			}
		}
	}
}
