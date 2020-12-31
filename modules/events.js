// @ts-check

const Discord = require("thunderstorm")
const path = require("path")
const { Manager } = require("lavacord")
/** @type {import("node-fetch").default} */
// @ts-ignore
const fetch = require("node-fetch")
const ReactionMenu = require("@amanda/reactionmenu")

const passthrough = require("../passthrough")
const { client, config, constants, commands, reloader, reloadEvent, internalEvents } = passthrough

const common = require("../commands/music/common")
reloader.sync("./commands/music/common.js", common)

let prefixes = []
let statusPrefix = "&"
let starting = true
const messagesReceived = new Map()
if (client.readyAt != null) starting = false

const utils = require("./utilities")
reloader.sync("./modules/utilities/index.js", utils)

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
		console.log("Uh oh. Date.getDay did a fucky wucky")
		return remainingToday
	}
}

let autoPayTimeout
if (config.cluster_id === "pencil") {
	autoPayTimeout = setTimeout(autoPayTimeoutFunction, getTimeoutDuration())
	console.log("added timeout autoPayTimeout")
}
async function autoPayTimeoutFunction() {
	/** @type {Array<string>} */
	const donors = await utils.sql.all("SELECT * FROM Premium").then(rows => rows.map(r => r.userID))
	for (const ID of donors) {
		await utils.coinsManager.award(ID, 10000)
	}
	const time = getTimeoutDuration()
	console.log(`Donor payments completed. Set a timeout for ${utils.shortTime(time, "ms")}`)
	autoPayTimeout = setTimeout(autoPayTimeoutFunction, time)
}

reloadEvent.once(path.basename(__filename), () => {
	if (config.cluster_id === "pencil") {
		clearTimeout(autoPayTimeout)
		console.log("removed timeout autoPayTimeout")
	}
})

utils.addTemporaryListener(client, "message", path.basename(__filename), manageMessage)
if (!starting) manageReady()
else utils.addTemporaryListener(client, "ready", path.basename(__filename), manageReady)
utils.addTemporaryListener(client, "messageReactionAdd", path.basename(__filename), async (data) => {
	const channel = new Discord.PartialChannel({ id: data.channel_id }, client)
	/** @type {Discord.User} */
	// @ts-ignore
	const user = await utils.cacheManager.users.get(data.user_id, true, true)
	ReactionMenu.handler(data, channel, user, client)
})
utils.addTemporaryListener(client, "messageUpdate", path.basename(__filename), (message) => {
	const m = messagesReceived.get(message.id)
	if (m) {
		m.content = message.content || ""
		manageMessage(m, true)
	}
})
utils.addTemporaryListener(client, "error", path.basename(__filename), reason => {
	if (reason) console.error(reason)
})
utils.addTemporaryListener(process, "unhandledRejection", path.basename(__filename), reason => {
	let shouldIgnore = false
	if (reason && reason.code) {
		if ([500, 10003, 10008, 50001, 50013].includes(reason.code)) shouldIgnore = true
		if (reason.code == 500 && reason.name != "AbortError") shouldIgnore = false
	}
	if (shouldIgnore) return
	if (reason) console.error(reason)
	else console.log("There was an error but no reason")
})
utils.addTemporaryListener(client, "raw", path.basename(__filename), event => {
	if (event.t === "VOICE_STATE_UPDATE") {
		if (!client.lavalink) return
		client.lavalink.voiceStateUpdate(event.d)
	} else if (event.t === "VOICE_SERVER_UPDATE") {
		if (!client.lavalink) return
		client.lavalink.voiceServerUpdate(event.d)
	} else if (event.t === "GUILD_CREATE") {
		if (!client.lavalink) return
		if (!event.d.voice_states) return
		for (const state of event.d.voice_states) {
			client.lavalink.voiceStateUpdate({ ...state, guild_id: event.d.id })
			const ns = new Discord.VoiceState(state, client)
			common.voiceStateUpdate(ns)
		}
	}
})


/**
 * @param {Discord.Message} msg
 */
async function manageMessage(msg, isEdit = false) {
	if (msg.author.bot) {
		if (!msg.webhookID) {
			return
		} else {
			const result = await utils.resolveWebhookMessageAuthor(msg)
			if (!result) {
				return
			}
		}
	}
	if (!isEdit) {
		messagesReceived.set(msg.id, msg)
		setTimeout(() => { messagesReceived.delete(msg.id) }, 1000 * 60)
	}
	if (msg.content == `<@${client.user.id}>`.replace(" ", "") || msg.content == `<@!${client.user.id}>`.replace(" ", "")) return msg.channel.send(`Hey there! My prefix is \`${statusPrefix}\` or \`@${client.user.tag}\`. Try using \`${statusPrefix}help\` for a complete list of my commands.`)
	const prefix = prefixes.find(p => msg.content.startsWith(p))
	if (!prefix) return
	const cmdTxt = msg.content.substring(prefix.length).split(" ")[0]
	const suffix = msg.content.substring(cmdTxt.length + prefix.length + 1)
	const cmd = commands.cache.find(c => c.aliases.includes(cmdTxt))
	if (cmd) {
		const timeout = await utils.rateLimiter(msg.author.id, msg)
		if (!timeout.allowed) {
			if (timeout.reason) return msg.channel.send(timeout.reason)
			else return
		}
	}
	let lang
	const selflang = await utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID =? AND setting =?", [msg.author.id, "language"])
	if (selflang) lang = await utils.getLang(msg.author.id, "self")
	else if (msg.guild && msg.guild.id) lang = await utils.getLang(msg.guild.id, "guild")
	else lang = await utils.getLang(msg.author.id, "self")

	if (cmd) {
		try {
			await cmd.process(msg, suffix, lang)
		} catch (e) {
			if (e && e.code) {
				if (e.code == 10008) return
				if (e.code == 50013) return
			}
			// Report to original channel
			const msgTxt = `command ${cmdTxt} failed <:rip:401656884525793291>\n` + (await utils.stringify(e))
			const embed = new Discord.MessageEmbed()
				.setDescription(msgTxt)
				.setColor(0xdd2d2d)
			if (await utils.sql.hasPermission(msg.author, "eval")) msg.channel.send(embed)
			else msg.channel.send(`There was an error with the command ${cmdTxt} <:rip:401656884525793291>. The developers have been notified. If you use this command again and you see this message, please allow a reasonable time frame for this to be fixed`)

			// Report to #amanda-error-log
			embed.setTitle("Command error occurred.")
			let details = [
				["User", msg.author.tag],
				["User ID", msg.author.id],
				["Bot", msg.author.bot ? "Yes" : "No"]
			]
			if (msg.guild) {
				details = details.concat([
					["Guild ID", msg.guild.id],
					["Channel ID", msg.channel.id]
				])
			} else {
				details = details.concat([
					["DM", "Yes"]
				])
			}
			const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
			const detailsString = details.map(row =>
				`\`${row[0]}${" ​".repeat(maxLength - row[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
			).join("\n")
			embed.addFields([
				{ name: "Details", value: detailsString },
				{ name: "Message content", value: `\`\`\`\n${msg.content.replace(/`/g, "ˋ")}\`\`\`` }
			])
			if (!config.is_dev_env) new Discord.PartialChannel({ id: "512869106089852949" }, client).send(embed)
		}
	} else {
		if (msg.content.startsWith(`<@${client.user.id}>`) || msg.content.startsWith(`<@!${client.user.id}>`)) {
			if (!config.allow_ai) return
			const mention = msg.content.startsWith(`<@${client.user.id}>`) ? `<@${client.user.id}>` : `<@!${client.user.id}>`
			const chat = msg.content.substring(mention.length + 1)
			if (!chat) return
			if (chat.toLowerCase().startsWith("say") || chat.toLowerCase().startsWith("repeat")) return msg.channel.send("No thanks")
			try {
				fetch(`http://ask.pannous.com/api?input=${encodeURIComponent(chat)}`).then(async res => {
					const data = await res.json()
					if (!data.output || !data.output[0] || !data.output[0].actions) return msg.channel.send("Terribly sorry but my Ai isn't working as of recently (◕︵◕)\nHopefully, the issue gets resolved soon. Until then, why not try some of my other features?")
					let text = data.output[0].actions.say.text.replace(/Jeannie/gi, client.user.username).replace(/Master/gi, msg.member ? msg.member.displayName : msg.author.username).replace(/Pannous/gi, "PapiOphidian")
					if (text.length >= 2000) text = `${text.slice(0, 1999)}…`
					if (chat.toLowerCase().includes("ip") && text.match(/(\d{1,3}\.){3}\d{1,3}/)) return msg.channel.send("no")
					if (text == "IE=edge,chrome=1 (Answers.com)" && data.output[0].actions.source && data.output[0].actions.source.url) text = `I believe you can find the answer here: ${data.output[0].actions.source.url}`
					// It's really sad that I have to include these words into this blacklist but people will be people. Thanks.
					if (["sex", "fuck", "cock", "nigga", "nigger"].find(word => text.toLowerCase().includes(word))) return msg.channel.send("I think I misunderstood what you said. My response was a bit unprofessional. Let's talk about something else")
					msg.channel.send(text)
				})
			} catch (error) { msg.channel.send(error) }
		} else return
	}
}

async function manageReady() {
	const firstStart = starting
	starting = false
	utils.sql.all("SELECT * FROM AccountPrefixes WHERE userID = ?", [client.user.id]).then(result => {
		prefixes = result.map(r => r.prefix)
		statusPrefix = result.find(r => r.status).prefix
		passthrough.statusPrefix = statusPrefix
		console.log(`Loaded ${prefixes.length} prefixes: ${prefixes.join(" ")}`)
		if (firstStart) internalEvents.emit("prefixes", prefixes, statusPrefix)
	})

	if (firstStart) {
		console.log(`Successfully logged in as ${client.user.username}`)
		process.title = client.user.username

		/** @type {[any, any]} */
		// eslint-disable-next-line prefer-const
		let [lavalinkNodes, lavalinkNodeRegions] = await Promise.all([
			utils.sql.all("SELECT * FROM LavalinkNodes"),
			utils.sql.all("SELECT * FROM LavalinkNodeRegions")
		])
		lavalinkNodes = lavalinkNodes.map(node => {
			node = { ...node }
			node.regions = lavalinkNodeRegions.filter(row => row.host === node.host).map(row => row.region)
			node.password = config.lavalink_password
			node.enabled = !!node.enabled
			node.id = node.name.toLowerCase()
			node.search_with_invidious = !!node.search_with_invidious
			node.resumeKey = `${client.user.id}/${config.cluster_id}`
			return node
		})

		constants.lavalinkNodes = lavalinkNodes
		client.lavalink = new Manager(constants.lavalinkNodes.filter(n => n.enabled), {
			user: client.user.id,
			shards: config.shard_list.length,
			send: (packet) => {
				passthrough.workers.gateway.sendMessage(packet)
			}
		})

		client.lavalink.once("ready", async () => {
			console.log("Lavalink ready")
			/** @type {{ queues: Array<any> }} */
			const data = await passthrough.nedb.queue.findOne({ _id: `QueueStore_${config.cluster_id}` })
			if (!data) return
			if (data.queues.length > 0) passthrough.queues.restore()
		})

		client.lavalink.on("error", (error, node) => {
			// @ts-ignore
			console.error(`Failed to initialise Lavalink: ${error && error.message ? error.message : error}`)
		})

		await client.lavalink.connect()

		utils.sql.all("SELECT * FROM RestartNotify WHERE botID = ?", [client.user.id]).then(result => {
			result.forEach(async row => {
				/** @type {Discord.TextChannel} */
				// @ts-ignore
				const channel = await utils.cacheManager.channels.get(row.channelID, true, true)
				if (channel) channel.send(`<@${row.mentionID}> Restarted! Uptime: ${utils.shortTime(process.uptime(), "sec")}`)
				else {
					new Discord.PartialUser({ id: row.mentionID }, client).send(`Restarted! Uptime: ${utils.shortTime(process.uptime(), "sec")}`).catch(() => console.log(`Could not notify ${row.mentionID}`))
				}
			})
			utils.sql.all("DELETE FROM RestartNotify WHERE botID = ?", [client.user.id])
		})

		passthrough.ipc.connect()
	}
}
