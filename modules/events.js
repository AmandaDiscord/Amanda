// @ts-check

const Discord = require("thunderstorm")
const { Manager } = require("lavacord")
const centra = require("centra")
const InteractionMenu = require("@amanda/interactionmenu")

const passthrough = require("../passthrough")
const { client, config, constants, commands, sync } = passthrough

/** @type {import("../commands/music/common")} */
const common = sync.require("../commands/music/common")

let starting = true
/**
 * @type {Map<string, Discord.Message>}
 */
const messagesReceived = new Map()
if (client.readyAt != null) starting = false

/** @type {import("./utilities")} */
const utils = sync.require("./utilities")

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
if (config.cluster_id === "maple") {
	autoPayTimeout = setTimeout(autoPayTimeoutFunction, getTimeoutDuration())
	console.log("added timeout autoPayTimeout")
}
async function autoPayTimeoutFunction() {
	/** @type {Array<string>} */
	const donors = await utils.orm.db.select("premium").then(rows => rows.map(r => r.user_id))
	for (const ID of donors) {
		await utils.coinsManager.award(ID, BigInt(10000), "Beneficiary deposit")
	}
	const time = getTimeoutDuration()
	console.log(`Donor payments completed. Set a timeout for ${utils.shortTime(time, "ms")}`)
	autoPayTimeout = setTimeout(autoPayTimeoutFunction, time)
}

sync.events.once(__filename, () => {
	if (config.cluster_id === "maple") {
		clearTimeout(autoPayTimeout)
		console.log("removed timeout autoPayTimeout")
	}
})


sync.addTemporaryListener(client, "message", manageMessage)
if (!starting) manageReady()
else sync.addTemporaryListener(client, "ready", manageReady)
sync.addTemporaryListener(client, "interaction",
	/**
	 * @param {Discord.Interaction} interaction
	 */
	async (interaction) => {
		if (interaction instanceof Discord.MessageComponentInteraction) {
			await interaction.deferUpdate()
			InteractionMenu.handle(interaction)
		}
	})
sync.addTemporaryListener(process, "unhandledRejection", reason => {
	let shouldIgnore = false
	if (reason && reason.code) {
		if ([500, 10003, 10008, 50001, 50013].includes(reason.code)) shouldIgnore = true
		if (reason.code == 500 && reason.name != "AbortError") shouldIgnore = false
	}
	if (shouldIgnore) return
	if (reason) console.error(reason)
	else console.log("There was an error but no reason")
})
sync.addTemporaryListener(client, "raw", event => {
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
			const ns = new Discord.VoiceState(client, state)
			common.voiceStateUpdate(ns)
		}
	} else if (event.t === "MESSAGE_UPDATE") {
		if (!event.d.edited_timestamp) return
		const m = messagesReceived.get(event.d.id)
		if (m) {
			m._patch(event.d)
			manageMessage(m, true)
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
	const prefixes = await utils.getPrefixes(msg)
	if (msg.content == `<@${client.user.id}>`.replace(" ", "") || msg.content == `<@!${client.user.id}>`.replace(" ", "")) return msg.channel.send(`Hey there! My prefix is \`${prefixes.main}\` or \`@${client.user.tag}\`. Try using \`${prefixes.main}help\` for a complete list of my commands.`)
	const prefix = prefixes.array.find(p => msg.content.startsWith(p))
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
	const selflang = await utils.orm.db.get("settings_self", { key_id: msg.author.id, setting: "language" })
	if (selflang) lang = await utils.getLang(msg.author.id, "self")
	else if (msg.guild && msg.guild.id) lang = await utils.getLang(msg.guild.id, "guild")
	else lang = await utils.getLang(msg.author.id, "self")

	if (cmd) {
		try {
			await cmd.process(msg, suffix, lang, prefixes)
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
			if (await utils.sql.hasPermission(msg.author, "eval")) msg.channel.send({ embeds: [embed] })
			else msg.channel.send(`There was an error with the command ${cmdTxt} <:rip:401656884525793291>. The developers have been notified. If you use this command again and you see this message, please allow a reasonable time frame for this to be fixed`).catch(() => console.log("Error with sending alert that command failed. Probably a 403 resp code"))

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
			if (!config.is_dev_env) new Discord.PartialChannel(client, { id: "512869106089852949" }).send({ embeds: [embed] })
		}
	} else {
		if (msg.content.startsWith(`<@${client.user.id}>`) || msg.content.startsWith(`<@!${client.user.id}>`)) {
			if (!config.allow_ai) return
			const mention = msg.content.startsWith(`<@${client.user.id}>`) ? `<@${client.user.id}>` : `<@!${client.user.id}>`
			const chat = msg.content.substring(mention.length + 1)
			if (!chat) return
			if (chat.toLowerCase().startsWith("say") || chat.toLowerCase().startsWith("repeat")) return msg.channel.send("No thanks")
			try {
				centra(`http://ask.pannous.com/api?input=${encodeURIComponent(chat)}`).send().then(async res => {
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

	if (firstStart) {
		console.log(`Successfully logged in as ${client.user.username}`)
		process.title = client.user.username

		// eslint-disable-next-line prefer-const
		const [lavalinkNodeData, lavalinkNodeRegions] = await Promise.all([
			utils.orm.db.select("lavalink_nodes"),
			utils.orm.db.select("lavalink_node_regions")
		])
		const lavalinkNodes = lavalinkNodeData.map(node => {
			const newData = {
				regions: lavalinkNodeRegions.filter(row => row.host === node.host).map(row => row.region),
				password: config.lavalink_password,
				enabled: !!node.enabled,
				id: node.name.toLowerCase(),
				search_with_invidious: !!node.search_with_invidious,
				resumeKey: `${client.user.id}/${config.cluster_id}`
			}
			return Object.assign(newData, { host: node.host, port: node.port, invidious_origin: node.invidious_origin, name: node.name })
		})

		constants.lavalinkNodes = lavalinkNodes
		client.lavalink = new Manager(constants.lavalinkNodes.filter(n => n.enabled), {
			user: client.user.id,
			shards: config.total_shards,
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

		try {
			await client.lavalink.connect()
		} catch (e) {
			console.log("There was a lavalink connect error. One of the nodes may be offline or unreachable")
		}

		utils.orm.db.select("restart_notify", { bot_id: client.user.id }).then(result => {
			result.forEach(async row => {
				/** @type {Discord.TextChannel} */
				// @ts-ignore
				const channel = await utils.cacheManager.channels.get(row.channel_id, true, true)
				if (channel) channel.send(`<@${row.mention_id}> Restarted! Uptime: ${utils.shortTime(process.uptime(), "sec")}`)
				else {
					new Discord.PartialUser(client, { id: row.mention_id }).send(`Restarted! Uptime: ${utils.shortTime(process.uptime(), "sec")}`).catch(() => console.log(`Could not notify ${row.mention_id}`))
				}
			})
			utils.orm.db.delete("restart_notify", { bot_id: client.user.id })
		})

		passthrough.ipc.connect()
	}
}
