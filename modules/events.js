// @ts-check

const Discord = require("discord.js")
const path = require("path")
const { PlayerManager } = require("discord.js-lavalink")
/** @type {import("node-fetch").default} */
// @ts-ignore
const fetch = require("node-fetch")
const ReactionMenu = require("@amanda/reactionmenu")

const passthrough = require("../passthrough")
const { client, config, constants, commands, reloader, reloadEvent } = passthrough

const lastAttemptedLogins = []

let prefixes = []
let statusPrefix = "&"
let starting = true
if (client.readyAt != null) starting = false

const utils = require("./utilities.js")
reloader.sync("./modules/utilities.js", utils)

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
if (utils.isFirstShardOnMachine()) {
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
	if (utils.isFirstShardOnMachine()) {
		clearTimeout(autoPayTimeout)
		console.log("removed timeout autoPayTimeout")
	}
})

utils.addTemporaryListener(client, "message", path.basename(__filename), manageMessage)
if (!starting) manageReady()
else utils.addTemporaryListener(client, "ready", path.basename(__filename), manageReady)
utils.addTemporaryListener(client, "messageReactionAdd", path.basename(__filename), (data, channel, user) => ReactionMenu.handler(data, channel, user, client))
utils.addTemporaryListener(client, "messageUpdate", path.basename(__filename), data => {
	if (data && data.id && data.channel_id && data.content && data.author) {
		const channel = client.channels.cache.get(data.channel_id)
		// ensure channel is a message channel, and ensure member exists if is a guild channel
		if (channel instanceof Discord.DMChannel || (channel instanceof Discord.TextChannel && data.member)) {
			const message = new Discord.Message(client, data, channel)
			manageMessage(message)
		}
	}
})
utils.addTemporaryListener(client, "shardDisconnected", path.basename(__filename), (reason) => {
	if (reason) console.log(`Disconnected with ${reason.code} at ${reason.path}.`)
	if (lastAttemptedLogins.length) console.log(`Previous disconnection was ${Math.floor(Date.now() - lastAttemptedLogins.slice(-1)[0] / 1000)} seconds ago.`)
	lastAttemptedLogins.push(Date.now())
	new Promise(resolve => {
		if (lastAttemptedLogins.length >= 3) {
			const oldest = lastAttemptedLogins.shift()
			const timePassed = Date.now() - oldest
			const timeout = 30000
			if (timePassed < timeout) return setTimeout(() => resolve(), timeout - timePassed)
		}
		return resolve()
	}).then(() => {
		client.login(config.bot_token)
	})
})
utils.addTemporaryListener(client, "error", path.basename(__filename), reason => {
	if (reason) console.error(reason)
})
utils.addTemporaryListener(client, "guildMemberUpdate", path.basename(__filename), async (oldMember, newMember) => {
	if (newMember.guild.id != "475599038536744960") return
	if (!oldMember.roles.cache.get("475599593879371796") && newMember.roles.cache.get("475599593879371796")) {
		const row = await utils.sql.get("SELECT * FROM Premium WHERE userID =?", newMember.id)
		if (!row) await utils.sql.all("INSERT INTO Premium (userID, state) VALUES (?, ?)", [newMember.id, 1])
		else return
	} else return
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
/**
 * @param {Discord.Message} msg
 */
async function manageMessage(msg) {
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
	if (msg.content == `<@${client.user.id}>`.replace(" ", "") || msg.content == `<@!${client.user.id}>`.replace(" ", "")) return msg.channel.send(`Hey there! My prefix is \`${statusPrefix}\` or \`@${client.user.tag}\`. Try using \`${statusPrefix}help\` for a complete list of my commands.`)
	const prefix = prefixes.find(p => msg.content.startsWith(p))
	if (!prefix) return
	if (msg.guild) await msg.guild.members.fetch(client.user)
	const cmdTxt = msg.content.substring(prefix.length).split(" ")[0]
	const suffix = msg.content.substring(cmdTxt.length + prefix.length + 1)
	const cmd = commands.cache.find(c => c.aliases.includes(cmdTxt))
	let lang
	const selflang = await utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID =? AND setting =?", [msg.author.id, "language"])
	if (selflang) lang = await utils.getLang(msg.author.id, "self")
	else if (msg.guild) lang = await utils.getLang(msg.guild.id, "guild")
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
			if (await utils.hasPermission(msg.author, "eval")) msg.channel.send(embed)
			else msg.channel.send(`There was an error with the command ${cmdTxt} <:rip:401656884525793291>. The developers have been notified. If you use this command again and you see this message, please allow a reasonable time frame for this to be fixed`)
			// Report to #amanda-error-log
			const reportChannel = client.channels.cache.get("512869106089852949")
			if (reportChannel instanceof Discord.TextChannel && reportChannel.permissionsFor(client.user).has("VIEW_CHANNEL")) {
				embed.setTitle("Command error occurred.")
				let details = [
					["User", msg.author.tag],
					["User ID", msg.author.id],
					["Bot", msg.author.bot ? "Yes" : "No"]
				]
				if (msg.channel instanceof Discord.TextChannel) {
					details = details.concat([
						["Guild", msg.guild.name],
						["Guild ID", msg.guild.id],
						["Channel", "#" + msg.channel.name],
						["Channel ID", msg.channel.id]
					])
				} else {
					details = details.concat([
						["DM", "Yes"]
					])
				}
				const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
				const detailsString = details.map(row =>
					"`" + row[0] + " ​".repeat(maxLength - row[0].length) + "` " + row[1] // SC: space + zwsp, wide space
				).join("\n")
				embed.addFields([
					{ name: "Details", value: detailsString },
					{ name: "Message content", value: "```\n" + msg.content.replace(/`/g, "ˋ") + "```" }
				])
				reportChannel.send(embed)
			}
		}
	} else {
		if (msg.content.startsWith(`<@${client.user.id}>`) || msg.content.startsWith(`<@!${client.user.id}>`)) {
			if (!config.allow_ai) return
			const username = msg.guild ? msg.guild.me.displayName : client.user.username
			const chat = msg.cleanContent.replace(new RegExp(`@${username},?`), "").trim()
			if (!chat) return
			msg.channel.sendTyping()
			if (chat.toLowerCase().startsWith("say")) return
			try {
				fetch(`http://ask.pannous.com/api?input=${encodeURIComponent(chat)}`).then(async res => {
					const data = await res.json()
					if (!data.output || !data.output[0] || !data.output[0].actions) return msg.channel.send("Terribly sorry but my Ai isn't working as of recently (◕︵◕)\nHopefully, the issue gets resolved soon. Until then, why not try some of my other features?")
					let text = data.output[0].actions.say.text.replace(/Jeannie/gi, client.user.username).replace(/Master/gi, msg.member ? msg.member.displayName : msg.author.username).replace(/Pannous/gi, "PapiOphidian")
					if (text.length >= 2000) text = text.slice(0, 1999) + "…"
					if (chat.toLowerCase().includes("ip") && text.match(/(\d{1,3}\.){3}\d{1,3}/)) return msg.channel.send("no")
					if (text == "IE=edge,chrome=1 (Answers.com)" && data.output[0].actions.source && data.output[0].actions.source.url) text = "I believe you can find the answer here: " + data.output[0].actions.source.url
					if (["sex", "fuck", "cock"].find(word => text.toLowerCase().includes(word))) return msg.channel.send("I think I misunderstood what you said. My response was a bit unprofessional. Let's talk about something else")
					msg.channel.send(text)
				})
			} catch (error) { msg.channel.send(error) }
		} else return
	}
}

function manageReady() {
	const firstStart = starting
	starting = false
	utils.sql.all("SELECT * FROM AccountPrefixes WHERE userID = ?", [client.user.id]).then(result => {
		prefixes = result.map(r => r.prefix)
		statusPrefix = result.find(r => r.status).prefix
		passthrough.statusPrefix = statusPrefix
		console.log("Loaded " + prefixes.length + " prefixes: " + prefixes.join(" "))
		// we should probably use a different event or a callback instead.
		// @ts-ignore
		if (firstStart) client.emit("prefixes", prefixes, statusPrefix)
	})
	if (firstStart) {
		console.log(`Successfully logged in as ${client.user.username}`)
		process.title = client.user.username
		console.log(client.user.id + "/" + utils.getShardsArray())
		constants.lavalinkNodes.forEach(node => node.resumeKey = client.user.id + "/" + utils.getShardsArray())
		client.lavalink = new PlayerManager(this, constants.lavalinkNodes.filter(n => n.enabled), {
			user: client.user.id,
			shards: client.options.shardCount
		})
		client.lavalink.once("ready", async () => {
			console.log("Lavalink ready")
			/** @type {{ queues: Array<any> }} */
			const data = await passthrough.nedb.queue.findOne({ _id: "QueueStore_" + utils.getFirstShard() })
			if (!data) return
			if (data.queues.length > 0) passthrough.queues.restore()
		})
		client.lavalink.on("error", (self, error) => {
			console.error("Failed to initialise Lavalink: " + error.message)
		})
		utils.sql.all("SELECT * FROM RestartNotify WHERE botID = ?", [client.user.id]).then(result => {
			result.forEach(row => {
				const channel = client.channels.cache.get(row.channelID)
				if (channel instanceof Discord.TextChannel) channel.send("<@" + row.mentionID + "> Restarted! Uptime: " + utils.shortTime(process.uptime(), "sec"))
				else {
					const user = client.users.cache.get(row.mentionID)
					if (!user) console.log(`Could not notify ${row.mentionID}`)
					else user.send("Restarted! Uptime: " + utils.shortTime(process.uptime(), "sec"))
				}
			})
			utils.sql.all("DELETE FROM RestartNotify WHERE botID = ?", [client.user.id])
		})

		passthrough.ipc.connect()
	}
}
