/* eslint-disable no-async-promise-executor */
// @ts-check

const Discord = require("thunderstorm")

const sql = require("./sql")
const { shortTime } = require("./time")

const passthrough = require("../../passthrough")
const { client } = passthrough

/**
 * @param {Discord.User} user
 * @returns {Array<string>}
 */
function userFlagEmojis(user) {
	const flags = user.flags // All of these emojis are from Papi's Dev House.
	const arr = [] // The emojis are pushed to the array in order of which they'd appear in Discord.
	if (!flags) return arr
	if (testFlag(flags, 1 << 0)) arr.push("<:staff:433155028895793172>") // Discord Employee
	if (testFlag(flags, 1 << 1)) arr.push("<:partner:421802275326001152>") // Discord partner
	if (testFlag(flags, 1 << 2)) arr.push("<:HypesquadEvents:719628242449072260>") // HypeSquad Events
	if (testFlag(flags, 1 << 8)) arr.push("<:balance:479939338696654849>") // House Balance
	if (testFlag(flags, 1 << 6)) arr.push("<:bravery:479939311593324557>") // House Bravery
	if (testFlag(flags, 1 << 7)) arr.push("<:brilliance:479939329104412672>") // House Brilliance
	if (testFlag(flags, 1 << 17)) arr.push("<:VerifiedDeveloper:699408396591300618>") // Verified Bot Developer
	if (testFlag(flags, 1 << 14)) arr.push("<:BugCatcherlvl2:678721839488434203>") // Bug Hunter Level 2
	if (testFlag(flags, 1 << 3) && !testFlag(flags, 1 << 14)) arr.push("<:BugCatcher:434087337488678921>") // Bug Hunter Level 1
	if (testFlag(flags, 1 << 9)) arr.push("<:EarlySupporter:585638218255564800>")
	return arr
}

/**
 * @param {number} flags
 * @param {number} flag
 */
function testFlag(flags, flag) {
	return (flags & flag) == flag
}

/**
 * @param {{ channelID?: string, userIDs?: Array<string>, timeout?: number, matches?: number, test?: (message?: Discord.Message) => boolean }} filter
 * @param {(message?: Discord.Message) => any} callback
 * @param {() => any} [onFail]
 */
function createMessageCollector(filter = {}, callback, onFail) {
	let timerdur = (1000 * 60), maxMatches = 1
	if (filter.timeout) timerdur = filter.timeout
	if (filter.matches) maxMatches = filter.matches
	const timer = setTimeout(() => {
		clear()
		if (onFail) onFail()
	}, timerdur)

	let matches = 0
	function clear() {
		client.removeListener("message", listener)
		clearTimeout(timer)
	}
	client.on("message", listener)

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
			if (filter.test(message)) {
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
	const row = await sql.get(
		"SELECT userID, user_username, user_discriminator FROM WebhookAliases \
		WHERE webhookID = ? AND webhook_username = ?",
		[msg.webhookID, msg.author.username]
	)
	if (!row) return null
	/** @type {Discord.User} */
	let newAuthor
	let newUserData
	await cacheManager.users.get(row.userID, true).then(m => {
		// @ts-ignore
		newAuthor = m
	}).catch(() => {
		newUserData = {
			id: row.userID,
			bot: false,
			username: row.user_username,
			discriminator: row.user_discriminator,
			avatar: null
		}
		newAuthor = new Discord.User(newUserData, client)
	})
	msg.author = newAuthor
	return msg
}

/**
 * @param {Discord.PartialChannel} channel
 * @param {string|Discord.MessageEmbed} content
 */
async function contentify(channel, content) {
	const { cacheManager } = require("./cachemanager") // lazy require
	let value = ""
	/** @type {number} */
	// @ts-ignore
	if (content instanceof Discord.MessageEmbed) {
		if (!(await cacheManager.channels.hasPermissions({ id: channel.id, guild_id: channel.guild ? channel.guild.id : undefined }, 0x00004000))) { // EMBED_LINKS (https://discord.com/developers/docs/topics/permissions#permissions)
			value = `${content.author ? `${content.author.name}\n` : ""}${content.title ? `${content.title}${content.url ? ` - ${content.url}` : ""}\n` : ""}${content.description ? `${content.description}\n` : ""}${content.fields.length > 0 ? `${content.fields.map(f => `${f.name}\n${f.value}`).join("\n")}\n` : ""}${content.image ? `${content.image.url}\n` : ""}${content.footer ? content.footer.text : ""}`
			if (value.length > 2000) value = `${value.slice(0, 1960)}…`
			value += "\nPlease allow me to embed content"
		} else return content
	} else if (typeof (content) == "string") {
		value = content
		if (value.length > 2000) value = `${value.slice(0, 1998)}…`
	}
	return value.replace(/\[(.+?)\]\((https?:\/\/.+?)\)/gs, "$1: $2")
}

/**
 * @param {string} id
 * @param {Discord.Message} [msg]
 * @returns {Promise<{ allowed: boolean, ban?: "temporary" | "permanent", reason?: string }>}
 */
async function rateLimiter(id, msg) {
	const banned = await sql.get("SELECT * FROM Bans WHERE userID =?", id)
	const tempmsg = `${id === msg.author.id ? `${msg.author.tag}, you are` : "That person is"} temporarily banned from using commands.`
	if (banned) {
		if (banned.temporary && msg) {
			if (banned.expires <= Date.now()) {
				await Promise.all([
					sql.all("DELETE FROM Bans WHERE userID =?", id),
					sql.all("DELETE FROM Timeouts WHERE userID =?", id)
				])
				return { allowed: true }
			} else return { allowed: false, ban: "temporary", reason: tempmsg + ` Expires at ${new Date(banned.expires).toUTCString()}` }
		} else if (!banned.temporary && msg) return { allowed: false, ban: "permanent", reason: `${id === msg.author.id ? `${msg.author.tag}, you are` : "That person is"} permanently banned from using commands.` }
		else return { allowed: false }
	}
	const [timer, premium] = await Promise.all([
		sql.get("SELECT * FROM Timeouts WHERE userID =?", id),
		sql.get("SELECT * FROM Premium WHERE userID =?", id)
	])
	if (premium) return { allowed: true }
	if (timer) {
		if (timer.expires <= Date.now()) {
			await sql.all("DELETE FROM Timeouts WHERE userID =?", id)
			return { allowed: true }
		}
		if (timer.amount > 6) {
			const expiresAt = Date.now() + (1000 * 60 * 60)
			await sql.all("INSERT INTO Bans (userID, temporary, expires) VALUES (?, ?, ?)", [id, 1, expiresAt])
			return { allowed: false, ban: "temporary", reason: tempmsg + ` Expires at ${new Date(expiresAt).toUTCString()}` }
		}
		return { allowed: false, reason: `${id === msg.author.id ? `${msg.author.tag}, you are` : "That person is"} on a command cooldown. You can use commands again in ${shortTime(timer.expires - Date.now(), "ms")}` }
	} else {
		const expiresAt = Date.now() + (1000 * 5)
		await sql.all("REPLACE INTO Timeouts (userID, expires, amount) VALUES (?, ?, ?)", [id, expiresAt, 1])
		return { allowed: true }
	}
}

module.exports.userFlagEmojis = userFlagEmojis
module.exports.emojiURL = emojiURL
module.exports.resolveWebhookMessageAuthor = resolveWebhookMessageAuthor
module.exports.contentify = contentify
module.exports.createMessageCollector = createMessageCollector
module.exports.rateLimiter = rateLimiter
