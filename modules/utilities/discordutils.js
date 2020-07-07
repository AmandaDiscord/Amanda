// @ts-check

const Discord = require("discord.js")

const sql = require("./sql")

const passthrough = require("../../passthrough")
const { client } = passthrough

const uncachedChannelSendBlacklist = new Set()

/**
 * @param {Discord.User} user
 * @returns {Array<string>}
 */
function userFlagEmojis(user) {
	const flags = user.flags // All of these emojis are from Papi's Dev House.
	const arr = [] // The emojis are pushed to the array in order of which they'd appear in Discord.
	if (!flags) return arr
	if (flags.has("DISCORD_EMPLOYEE")) arr.push("<:staff:433155028895793172>")
	if (flags.has("DISCORD_PARTNER")) arr.push("<:partner:421802275326001152>")
	if (flags.has("HYPESQUAD_EVENTS")) arr.push("<:HypesquadEvents:719628242449072260>")
	if (flags.has("HOUSE_BALANCE")) arr.push("<:balance:479939338696654849>")
	if (flags.has("HOUSE_BRAVERY")) arr.push("<:bravery:479939311593324557>")
	if (flags.has("HOUSE_BRILLIANCE")) arr.push("<:brilliance:479939329104412672>")
	if (flags.has("VERIFIED_DEVELOPER")) arr.push("<:VerifiedDeveloper:699408396591300618>")
	if (flags.has("BUGHUNTER_LEVEL_2")) arr.push("<:BugCatcherlvl2:678721839488434203>")
	if (flags.has("BUGHUNTER_LEVEL_1") && !flags.has("BUGHUNTER_LEVEL_2")) arr.push("<:BugCatcher:434087337488678921>")
	if (flags.has("EARLY_SUPPORTER")) arr.push("<:EarlySupporter:585638218255564800>")
	return arr
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
	const row = await sql.get(
		"SELECT userID, user_username, user_discriminator FROM WebhookAliases"
			+ " WHERE webhookID = ? AND webhook_username = ?",
		[msg.webhookID, msg.author.username]
	)
	if (!row) return null
	/** @type {Discord.User} */
	let newAuthor
	let newUserData
	if (client.users.cache.has(row.userID)) {
		newAuthor = client.users.cache.get(row.userID)
	} else {
		await client.users.fetch(row.userID).then(m => {
			newAuthor = m
		}).catch(() => {
			newUserData = {
				id: row.userID,
				bot: false,
				username: row.user_username,
				discriminator: row.user_discriminator,
				avatar: null
			}
			newAuthor = new Discord.User(client, newUserData)
		})
	}
	msg.author = newAuthor
	/** @type {Discord.GuildMember} */
	if (!msg.guild.members.cache.has(row.userID)) {
		await msg.guild.members.fetch(row.userID).catch(() => {
			msg.guild.members.add(newUserData)
		})
	}
	return msg
}

/**
 * discord.js is hilarious(ly awful)
 * @param {string} channelID
 * @param {boolean} useBlacklist refuse to send more messages to channels with missing access
 * @param {Discord.MessageOptions|Discord.MessageAdditions} content
 */
function sendToUncachedChannel(channelID, useBlacklist, content) {
	if (useBlacklist) {
		if (uncachedChannelSendBlacklist.has(channelID)) return Promise.reject(new Error("Channel is blacklisted because you did not have permission last time."))
	} else {
		uncachedChannelSendBlacklist.delete(channelID)
	}
	// @ts-ignore holy shit, remove this and see what happens. it's so so cursed
	return client.api.channels[channelID].messages.post(
		Discord.APIMessage.create(
			// @ts-ignore xd
			{ id: channelID, client: client },
			content
		).resolveData()
	).catch(error => {
		if (error && error.name === "DiscordAPIError" && error.code === 50001) { // missing access
			uncachedChannelSendBlacklist.add(channelID)
		}
		throw error
	})
}

/**
 * @param {Discord.TextChannel|Discord.DMChannel} channel
 * @param {string|Discord.MessageEmbed} content
 */
function contentify(channel, content) {
	if (channel.type != "text") return content
	let value = ""
	let permissions
	if (channel instanceof Discord.TextChannel) permissions = channel.permissionsFor(client.user)
	if (content instanceof Discord.MessageEmbed) {
		if (permissions && !permissions.has("EMBED_LINKS")) {
			value = `${content.author ? `${content.author.name}\n` : ""}${content.title ? `${content.title}${content.url ? ` - ${content.url}` : ""}\n` : ""}${content.description ? `${content.description}\n` : ""}${content.fields.length > 0 ? content.fields.map(f => `${f.name}\n${f.value}`).join("\n") + "\n" : ""}${content.image ? `${content.image.url}\n` : ""}${content.footer ? content.footer.text : ""}`
			if (value.length > 2000) value = `${value.slice(0, 1960)}…`
			value += "\nPlease allow me to embed content"
		} else return content
	} else if (typeof (content) == "string") {
		value = content
		if (value.length > 2000) value = `${value.slice(0, 1998)}…`
	}
	return value.replace(/\[(.+?)\]\((https?:\/\/.+?)\)/gs, "$1: $2")
}

module.exports.userFlagEmojis = userFlagEmojis
module.exports.emojiURL = emojiURL
module.exports.resolveWebhookMessageAuthor = resolveWebhookMessageAuthor
module.exports.sendToUncachedChannel = sendToUncachedChannel
module.exports.contentify = contentify
