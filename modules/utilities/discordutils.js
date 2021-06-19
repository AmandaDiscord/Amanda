/* eslint-disable no-async-promise-executor */
// @ts-check

const Discord = require("thunderstorm")
const c = require("centra")
const Jimp = require("jimp")

const passthrough = require("../../passthrough")
const { client, internalEvents, sync } = passthrough

/**
 * @type {import("./orm")}
 */
const orm = sync.require("./orm")
const db = orm.db

/**
 * @type {import("./time")}
 */
const time = sync.require("./time")
const shortTime = time.shortTime

/** @type {Array<(message: Discord.Message) => any>} */
const filters = []

let starting = true
if (client.readyAt != null) starting = false

/** @type {Array<string>} */
let prefixes = []
let statusPrefix = "&"


if (!starting) onReady()
else sync.addTemporaryListener(client, "ready", onReady)


function onReady() {
	const firstStart = starting
	starting = false
	db.select("account_prefixes", { user_id: client.user.id }).then(result => {
		prefixes = result.map(r => r.prefix)
		statusPrefix = result.find(r => r.status).prefix
		passthrough.statusPrefix = statusPrefix
		console.log(`Loaded ${prefixes.length} prefixes: ${prefixes.join(" ")}`)
		if (firstStart) internalEvents.emit("prefixes", prefixes, statusPrefix)
	})
}

sync.addTemporaryListener(client, "message", (message) => {
	filters.forEach(cb => cb(message))
})

/**
 * @param {Discord.User} user
 * @returns {Array<string>}
 */
function userFlagEmojis(user) {
	// All of these emojis are from Papi's Dev House.
	const arr = [] // The emojis are pushed to the array in order of which they'd appear in Discord.
	if (user.flags.has("DISCORD_EMPLOYEE")) arr.push("<:staff:433155028895793172>") // Discord Employee
	if (user.flags.has("PARTNERED_SERVER_OWNER")) arr.push("<:partner:421802275326001152>") // Discord partner
	if (user.flags.has("CERTIFIED_MODERATOR")) arr.push("<:CertifiedModerator:848030728792440872>") // Certified Moderator
	if (user.flags.has("HYPESQUAD_EVENTS")) arr.push("<:HypesquadEvents:719628242449072260>") // HypeSquad Events
	if (user.flags.has("HOUSE_BALANCE")) arr.push("<:balance:479939338696654849>") // House Balance
	if (user.flags.has("HOUSE_BRAVERY")) arr.push("<:bravery:479939311593324557>") // House Bravery
	if (user.flags.has("HOUSE_BRILLIANCE")) arr.push("<:brilliance:479939329104412672>") // House Brilliance
	if (user.flags.has("EARLY_VERIFIED_BOT_DEVELOPER")) arr.push("<:VerifiedDeveloper:699408396591300618>") // Verified Bot Developer
	if (user.flags.has("BUGHUNTER_LEVEL_2")) arr.push("<:BugCatcherlvl2:678721839488434203>") // Bug Hunter Level 2
	if (user.flags.has("BUGHUNTER_LEVEL_1") && !user.flags.has("BUGHUNTER_LEVEL_2")) arr.push("<:BugCatcher:434087337488678921>") // Bug Hunter Level 1
	if (user.flags.has("EARLY_SUPPORTER")) arr.push("<:EarlySupporter:585638218255564800>")
	return arr
}

/**
 * @param {{ channelID?: string, userIDs?: Array<string>, timeout?: number, matches?: number, test?: (message?: Discord.Message) => boolean }} filter
 * @param {(message?: Discord.Message) => any} callback
 * @param {() => any} [onFail]
 */
function createMessageCollector(filter, callback, onFail) {
	if (!filter) filter = {}
	let timerdur = (1000 * 60), maxMatches = 1
	if (filter.timeout) timerdur = filter.timeout
	if (filter.matches) maxMatches = filter.matches
	const timer = setTimeout(() => {
		clear()
		if (onFail) onFail()
	}, timerdur)

	let matches = 0
	function clear() {
		filters.splice(filters.indexOf(listener), 1)
		clearTimeout(timer)
	}
	filters.push(listener)

	/**
	 * @param {Discord.Message} message
	 */
	async function listener(message) {
		await resolveWebhookMessageAuthor(message)
		if (message.author.bot) return
		if (filter.channelID && message.channel.id !== filter.channelID) return
		let test

		if (filter.userIDs && filter.userIDs.includes(message.author.id)) test = true
		else if (filter.userIDs && filter.userIDs.includes(message.webhookID)) test = true
		else if (!filter.userIDs) test = true
		else test = false

		if (filter.test && test) {
			if (await filter.test(message)) {
				try {
					await callback(message)
					matches++
					if (matches === maxMatches) return clear()
				} catch (e) {
					if (onFail) return onFail()
				}
			}
		} else if (test) {
			try {
				await callback(message)
				matches++
				if (matches === maxMatches) return clear()
			} catch (e) {
				if (onFail) return onFail()
			}
		}
	}
}

/**
 * @param {string} id
 * @param {boolean} [animated]
 */
function emojiURL(id, animated = false) {
	const ext = animated ? "gif" : "png"
	return `https://cdn.discordapp.com/emojis/${id}.${ext}`
}

/**
 * @param {Discord.Message} msg
 */
async function resolveWebhookMessageAuthor(msg) {
	const { cacheManager } = require("./cachemanager") // lazy require
	const row = await db.get("webhook_aliases", { webhook_id: msg.webhookID, webhook_username: msg.author.username }, { select: ["user_id", "user_username", "user_discriminator"] })
	if (!row) return null
	/** @type {Discord.User} */
	let newAuthor
	let newUserData
	await cacheManager.users.get(row.user_id, true).then(m => {
		// @ts-ignore
		newAuthor = m
	}).catch(() => {
		newUserData = {
			id: row.user_id,
			bot: false,
			username: row.user_username,
			discriminator: row.user_discriminator,
			avatar: null
		}
		newAuthor = new Discord.User(client, newUserData)
	})
	msg.author = newAuthor
	return msg
}

/**
 * @param {import("thunderstorm/src/structures/interfaces/TextBasedChannel")} channel
 * @param {string | Discord.MessageEmbed | Array<Discord.MessageEmbed>} content
 */
async function contentify(channel, content) {
	const { cacheManager } = require("./cachemanager") // lazy require
	let value = ""
	/** @type {number} */
	// @ts-ignore
	if (content instanceof Discord.MessageEmbed || (Array.isArray(content) && content.every(i => i instanceof Discord.MessageEmbed))) {
		// @ts-ignore
		if (!(await cacheManager.channels.clientHasPermission({ id: channel.id, guild_id: channel.guild ? channel.guild.id : undefined }, "EMBED_LINKS"))) {
			value = (Array.isArray(content) ? content : [content]).map(embed => `${embed.author ? `${embed.author.name}\n` : ""}${embed.title ? `${embed.title}${embed.url ? ` - ${embed.url}` : ""}\n` : ""}${embed.description ? `${embed.description}\n` : ""}${embed.fields.length > 0 ? `${embed.fields.map(f => `${f.name}\n${f.value}`).join("\n")}\n` : ""}${embed.image ? `${embed.image.url}\n` : ""}${embed.footer ? embed.footer.text : ""}`).join("\n\n")
			if (value.length > 2000) value = `${value.slice(0, 1960)}…`
			value += "\nPlease allow me to embed content"
		} else return { embeds: Array.isArray(content) ? content : [content] }
	} else if (typeof (content) == "string") {
		value = content
		if (value.length > 2000) value = `${value.slice(0, 1998)}…`
	}
	return { content: value.replace(/\[(.+?)\]\((https?:\/\/.+?)\)/gs, "$1: $2") }
}

/**
 * @param {string} id
 * @param {Discord.Message} [msg]
 * @returns {Promise<{ allowed: boolean, ban?: "temporary" | "permanent", reason?: string }>}
 */
async function rateLimiter(id, msg) {
	const banned = await db.get("bans", { user_id: id })
	const tempmsg = `${id === msg.author.id ? `${msg.author.tag}, you are` : "That person is"} temporarily banned from using commands.`
	if (banned) {
		if (banned.temporary && msg) {
			if (Number(banned.expires) <= Date.now()) {
				await Promise.all([
					db.delete("bans", { user_id: id }),
					db.delete("timeouts", { user_id: id })
				])
				return { allowed: true }
			} else return { allowed: false, ban: "temporary", reason: tempmsg + ` Expires at ${new Date(banned.expires).toUTCString()}` }
		} else if (!banned.temporary && msg) return { allowed: false, ban: "permanent", reason: `${id === msg.author.id ? `${msg.author.tag}, you are` : "That person is"} permanently banned from using commands.` }
		else return { allowed: false }
	}
	const [timer, premium] = await Promise.all([
		db.get("timeouts", { user_id: id }),
		db.get("premium", { user_id: id })
	])
	if (premium && premium.state === 1) return { allowed: true }
	if (timer) {
		if (Number(timer.expires) <= Date.now()) {
			await db.delete("timeouts", { user_id: id })
			return { allowed: true }
		}
		if (timer.amount > 6) {
			const expiresAt = Date.now() + (1000 * 60 * 60)
			db.insert("bans", { user_id: id, temporary: 1, expires: expiresAt })
			return { allowed: false, ban: "temporary", reason: tempmsg + ` Expires at ${new Date(expiresAt).toUTCString()}` }
		}
		return { allowed: false, reason: `${id === msg.author.id ? `${msg.author.tag}, you are` : "That person is"} on a command cooldown. You can use commands again in ${shortTime(Number(timer.expires) - Date.now(), "ms")}` }
	} else {
		const expiresAt = Date.now() + (1000 * 5)
		db.upsert("timeouts", { user_id: id, expires: expiresAt, amount: 1 })
		return { allowed: true }
	}
}

/**
 * @param {Discord.Message} msg
 */
async function getPrefixes(msg) {
	const value = prefixes.filter(i => i.includes(client.user.id) || i.includes(client.user.username.toLowerCase()))
	const userPrefix = await db.get("settings_self", { key_id: msg.author.id, setting: "prefix" })
	let ur = false
	let gr = false
	/** @type {string} */
	let custom = statusPrefix

	if (userPrefix) {
		value.push(userPrefix.value)
		ur = true
		custom = userPrefix.value
	}

	if (msg.guild) {
		const guildPrefix = await db.get("settings_guild", { key_id: msg.guild.id, setting: "prefix" })
		if (guildPrefix) {
			value.push(guildPrefix.value)
			gr = true
			if (custom === statusPrefix) custom = guildPrefix.value
		}
	}

	if (!ur && !gr) return { main: custom, array: prefixes }
	else return { main: custom, array: value }
}

/**
 * @param {string} userID
 */
async function getAvatarJimp(userID) {
	const { cacheManager } = require("./cachemanager") // lazy require
	/** @type {Discord.User} */
	// @ts-ignore
	const user = await cacheManager.users.get(userID, true, true)

	const url = user.displayAvatarURL({ dynamic: true })
	const validation = await c(url, "head").send()
	if (validation.headers["content-type"] && validation.headers["content-type"].startsWith("image/")) return Jimp.read(url)

	const data = await cacheManager.users.fetch(userID)
	const newuser = cacheManager.users.parse(data)
	return Jimp.read(newuser.displayAvatarURL({ dynamic: true }))
}

module.exports.userFlagEmojis = userFlagEmojis
module.exports.emojiURL = emojiURL
module.exports.resolveWebhookMessageAuthor = resolveWebhookMessageAuthor
module.exports.contentify = contentify
module.exports.createMessageCollector = createMessageCollector
module.exports.rateLimiter = rateLimiter
module.exports.getPrefixes = getPrefixes
module.exports.getAvatarJimp = getAvatarJimp
