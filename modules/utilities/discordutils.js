// @ts-check

const Discord = require("thunderstorm")

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
function createMessageCollector(filter = { timeout: 1000 * 60, matches: 1 }, callback, onFail) {
	const timeout = setTimeout(clear, filter.timeout)
	let matches = 0
	function clear() {
		client.removeListener("message", listener)
		clearTimeout(timeout)
	}
	/**
	 * @param {Discord.Message} message
	 */
	function listener(message) {
		if (filter.channelID && message.channel.id !== filter.channelID) return
		let test = false

		if (filter.userIDs && (filter.userIDs.includes(message.author.id) || filter.userIDs.includes(message.webhookID))) test = true
		else if (!filter.userIDs) test = true

		if (filter.test && test) {
			if (filter.test(message)) {
				callback(message)
				matches++
				if (matches === filter.matches) clear()
			}
		} else if (test) {
			callback(message)
			matches++
			if (matches === filter.matches) clear()
		}

		if (filter.matches === 1 && !test && onFail) {
			onFail()
			clear()
		}
	}
	client.on("message", listener)
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
		"SELECT userID, user_username, user_discriminator FROM WebhookAliases \
		WHERE webhookID = ? AND webhook_username = ?",
		[msg.webhookID, msg.author.username]
	)
	if (!row) return null
	/** @type {Discord.User} */
	let newAuthor
	let newUserData
	await getUser(row.userID).then(m => {
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
 * discord.js is hilarious(ly awful)
 * @param {string} channelID
 * @param {boolean} useBlacklist refuse to send more messages to channels with missing access
 * @param {any} content
 */
function sendToUncachedChannel(channelID, useBlacklist, content) {
	if (useBlacklist) {
		if (uncachedChannelSendBlacklist.has(channelID)) return Promise.reject(new Error("Channel is blacklisted because you did not have permission last time."))
	} else {
		uncachedChannelSendBlacklist.delete(channelID)
	}
	// @ts-ignore holy shit, remove this and see what happens. it's so so cursed
	return client._snow.channel.createMessage(channelID, require("thunderstorm/structures/Interfaces/TextBasedChannel").transform(content), { disableEveryone: client._snow.options.disableEveryone || true }).catch(error => {
		if (error && error.name === "DiscordAPIError" && error.code === 50001) { // missing access
			uncachedChannelSendBlacklist.add(channelID)
		}
		throw error
	})
}

/**
 * @param {Discord.Message["channel"]} channel
 * @param {string|Discord.MessageEmbed} content
 */
async function contentify(channel, content) {
	let value = ""
	/** @type {number} */
	const permissions = await getChannelPermissions(channel)
	if (content instanceof Discord.MessageEmbed) {
		if (permissions && (permissions & 0x00004000) == 0x00004000) { // EMBED_LINKS (https://discord.com/developers/docs/topics/permissions#permissions)
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
 * @param {Discord.Message["channel"] | Discord.GuildChannel} channel
 * @returns {Promise<number>}
 */
async function getChannelPermissions(channel) {
	const chan = await client.rain.cache.channel.get(channel.id)
	if (chan && chan.boundObject && chan.boundObject.permission_overwrites) return chan.boundObject.permission_overwrites
	else return 0
}

/**
 * @param {Discord.Message["channel"]} channel
 */
async function getChannelType(channel) {
	const chan = await client.rain.cache.channel.get(channel.id)
	if (chan && chan.boundObject) {
		if (chan.boundObject.type === 0) return "text"
		else if (chan.boundObject.type === 1) return "dm"
		else if (chan.boundObject.type === 2) return "voice"
		else if (chan.boundObject.type === 4) return "category"
		else if (chan.boundObject.type === 5) return "news"
		else if (chan.boundObject.type === 6) return "store"
	} else return "text"
}

/**
 * @param {Discord.Message["guild"]} guild
 */
function getGuild(guild) {
	return client.rain.cache.guild.get(guild.id)
}

/**
 * @param {string} id
 * @param {boolean} [raw]
 * @returns {Promise<Discord.User | import("@amanda/discordtypings").UserData>}
 */
async function getUser(id, raw) {
	let d = await client.rain.cache.user.get(id)
	if (d && raw) return d.boundObject
	if (d) return new Discord.User(d.boundObject, client)
	else {
		// @ts-ignore
		d = await client._snow.user.getUser(id)
		// @ts-ignore
		if (d) await client.rain.cache.user.update(id, d)
		// @ts-ignore
		if (d && raw) return d
		// @ts-ignore
		if (d) return new Discord.User(d, client)
		else return null
	}
}

/**
 * @param {string} id
 * @param {string} guildID
 * @param {boolean} [raw]
 * @returns {Promise<Discord.GuildMember | import("@amanda/discordtypings").MemberData & { user: import("@amanda/discordtypings").UserData }>}
 */
async function getGuildMember(id, guildID, raw) {
	let d = await client.rain.cache.member.get(id, guildID)
	const ud = await getUser(id, true)
	if (d && raw) return { user: ud, ...d.boundObject }
	if (d) return new Discord.GuildMember({ user: ud, ...d.boundObject }, client)
	else {
		// @ts-ignore
		d = await client._snow.guild.getGuildMember(guildID, id)
		// @ts-ignore
		if (d) await client.rain.cache.member.update(id, guildID, d)
		// @ts-ignore
		if (d && raw) return { user: ud, ...d }
		// @ts-ignore
		if (d) return new Discord.GuildMember({ user: ud, ...d }, client)
	}
}

/**
 * @param {string} id
 * @param {boolean} [raw]
 */
async function getChannel(id, raw) {
	let d = await client.rain.cache.channel.get(id)
	if (d && raw) return d.boundObject
	if (d) return convertChannelData(d)
	else {
		// @ts-ignore
		d = await client._snow.channel.getChannel(id)
		if (d) await client.rain.cache.channel.update(id, d)
		if (d && raw) return d
		if (d) return convertChannelData(d)
	}
}

/**
 * @param {import("raincache/src/cache/ChannelCache") | import("@amanda/discordtypings").ChannelData} channel
 */
function convertChannelData(channel) {
	// @ts-ignore
	const d = channel.boundObject ? channel.boundObject.type : channel.type
	const type = d.type
	if (type === 0) return new Discord.TextChannel(d, client)
	else if (type === 1) return new Discord.DMChannel(d, client)
	else if (type === 2) return new Discord.VoiceChannel(d, client)
	else if (type === 4) return new Discord.CategoryChannel(d, client)
	else if (type === 5) return new Discord.NewsChannel(d, client)
	else return new Discord.Channel(d, client)
}

/**
 * @param {Discord.Message["channel"] | Discord.GuildChannel} channel
 * @param {number} permission
 * @param {number} [permissions]
 */
async function channelHasPermissions(channel, permission, permissions) {
	if (!permissions) permissions = await getChannelPermissions(channel)
	return (permissions & permission) == permission
}

module.exports.userFlagEmojis = userFlagEmojis
module.exports.emojiURL = emojiURL
module.exports.resolveWebhookMessageAuthor = resolveWebhookMessageAuthor
module.exports.sendToUncachedChannel = sendToUncachedChannel
module.exports.contentify = contentify
module.exports.createMessageCollector = createMessageCollector
module.exports.getChannelPermissions = getChannelPermissions
module.exports.getChannelType = getChannelType
module.exports.getGuild = getGuild
module.exports.getUser = getUser
module.exports.getGuildMember = getGuildMember
module.exports.channelHasPermissions = channelHasPermissions
module.exports.getChannel = getChannel
module.exports.convertChannelData = convertChannelData
