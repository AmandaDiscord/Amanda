import passthrough from "../passthrough"
const { client, sync, commands } = passthrough
let starting = true
if (client.readyAt) starting = false

const time = sync.require("../utils/time") as typeof import("../utils/time")
const lang = sync.require("../utils/language") as typeof import("../utils/language")
const logger = sync.require("../utils/logger") as typeof import("../utils/logger")
const orm = sync.require("../utils/orm") as typeof import("../utils/orm")

// Auto donor payment
function getTimeoutDuration() {
	const dayInMS = 1000 * 60 * 60 * 24
	const currently = new Date()
	const day = currently.getDay()
	const remainingToday = 1000 * 60 * 60 * 24 - (Date.now() % (1000 * 60 * 60 * 24))
	if (day == 0) return dayInMS + remainingToday // Sunday
	else if (day == 1) return remainingToday // Monday
	else if (day == 2) return dayInMS * 6 + remainingToday // Tuesday
	else if (day == 3) return dayInMS * 5 + remainingToday // Wednesday
	else if (day == 4) return dayInMS * 4 + remainingToday // Thursday
	else if (day == 5) return dayInMS * 3 + remainingToday // Friday
	else if (day == 6) return dayInMS * 2 + remainingToday // Saturday
	else {
		logger.warn("Uh oh. Date.getDay did a fucky wucky")
		return remainingToday
	}
}

let autoPayTimeout: NodeJS.Timeout | null
async function autoPayTimeoutFunction() {
	const donors = await orm.db.select("premium", undefined, { select: ["user_id"] }).then(rows => rows.map(r => r.user_id))
	for (const ID of donors) {
		logger.warn("Commented out code")
		// await utils.coinsManager.award(ID, BigInt(10000), "Beneficiary deposit")
	}
	const timeout = getTimeoutDuration()
	logger.info(`Donor payments completed. Set a timeout for ${time.shortTime(timeout, "ms")}`)
	autoPayTimeout = setTimeout(autoPayTimeoutFunction, timeout)
}

sync.addTemporaryListener(client, "raw", async p => {
	if (p.t === "READY") {
		if (starting) {
			starting = false
			logger.info(`Successfully logged in as ${p.d.user.username}`)
			process.title = p.d.user.username
		}
		let firstStart = true
		if (passthrough.clusterData.guild_ids[p.shard_id]) {
			firstStart = false
			passthrough.clusterData.guild_ids[p.shard_id].length = 0
		} else {
			passthrough.clusterData.guild_ids[p.shard_id] = []
			passthrough.clusterData.connected_shards.push(p.shard_id)
		}
		passthrough.clusterData.guild_ids[p.shard_id].push(...p.d.guilds.map(g => g.id))

		if (passthrough.clusterData.guild_ids[p.shard_id].length !== 0 && firstStart) {
			const arr = [...passthrough.clusterData.guild_ids[p.shard_id]]
			await orm.db.raw(`DELETE FROM voice_states WHERE guild_id IN (${arr.map((_, index) => `$${index + 1}`).join(", ")})`, arr)
			logger.info(`Deleted ${passthrough.clusterData.guild_ids[p.shard_id].length} voice states for shard ${p.shard_id}`)
		}
	} else if (p.t === "GUILD_CREATE") {
		if (passthrough.clusterData.guild_ids[p.shard_id].includes(p.d.id)) return
		else passthrough.clusterData.guild_ids[p.shard_id].push(p.d.id)
	} else if (p.t === "GUILD_DELETE") {
		const previous = passthrough.clusterData.guild_ids[p.shard_id].indexOf(p.d.id)
		if (previous !== -1) passthrough.clusterData.guild_ids[p.shard_id].splice(previous, 1)
	} else if (p.t === "VOICE_STATE_UPDATE") return
	else if (p.t === "VOICE_SERVER_UPDATE") return
})

sync.addTemporaryListener(client, "interactionCreate", async (interaction: import("thunderstorm").Interaction) => {

	if (interaction.isCommand()) {
		let langToUse: import("@amanda/lang").Lang
		const selflang = await orm.db.get("settings_self", { key_id: interaction.user.id, setting: "language" })
		if (selflang) langToUse = await lang.getLang(interaction.user.id, "self")
		else if (interaction.guild && interaction.guild.id) langToUse = await lang.getLang(interaction.guild.id, "guild")
		else langToUse = await lang.getLang(interaction.user.id, "self")

		try {
			await commands.cache.get((interaction as import("thunderstorm").CommandInteraction).commandName)?.process(interaction as import("thunderstorm").CommandInteraction, langToUse)
		} catch (e) {
			logger.error(e)
		}
	}
})
