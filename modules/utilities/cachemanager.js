// @ts-check

const Discord = require("discord.js")

const passthrough = require("../../passthrough")
const { client } = passthrough

const { contentify } = require("./discordutils")

/**
 * @param {Discord.Message} message Message Object
 * @param {string} string String to search members by
 * @param {boolean} [self=false] If the function should return the `message` author's member Object
 * @returns {Promise<Discord.GuildMember>}
 */
async function findMember(message, string, self = false) {
	string = string.toLowerCase()
	if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1]
	/** @type {Array<(member: Discord.GuildMember) => Boolean>} */
	let matchFunctions = []
	matchFunctions = matchFunctions.concat([
		member => member.id.includes(string),
		member => member.user.tag.toLowerCase() == string,
		member => member.user.username.toLowerCase() == string,
		member => member.displayName.toLowerCase() == string,
		member => member.user.username.toLowerCase().includes(string),
		member => member.displayName.toLowerCase().includes(string)
	])
	if (!string) {
		if (self) return message.member
		else return null
	} else {
		if (message.guild.members.cache.get(string)) return message.guild.members.cache.get(string)
		/** @type {Array<Discord.GuildMember>} */
		let list = []
		matchFunctions.forEach(i => message.guild.members.cache.filter(m => i(m)).forEach(mem => { if (!list.includes(mem) && list.length < 10) list.push(mem) }))
		if (list.length == 1) return list[0]
		if (list.length == 0) {
			const fetched = await fetch(string, message.guild)
			if (!fetched) return null
			if (Array.isArray(fetched)) {
				if (fetched.length == 0) return null
				else list = fetched
			} else return fetched
		}
		const embed = new Discord.MessageEmbed().setTitle("Member selection").setDescription(list.map((item, i) => `${i + 1}. ${item.user.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E")
		const selectmessage = await message.channel.send(contentify(message.channel, embed))
		const collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), { max: 1, time: 60000 })
		return collector.next.then(newmessage => {
			const index = parseInt(newmessage.content)
			if (!index || !list[index - 1]) return null
			selectmessage.delete()
			// eslint-disable-next-line no-empty-function
			newmessage.delete().catch(() => {})
			return list[index - 1]
		}).catch(() => {
			embed.setTitle("Member selection cancelled").setDescription("").setFooter("")
			selectmessage.edit(contentify(message.channel, embed))
			return null
		})
	}
}

/**
 * @param {Discord.Message} message Message Object
 * @param {string} string String to search users by
 * @param {boolean} [self=false] If the function should return the `message` author's user Object
 * @returns {Promise<Discord.User>}
 */
async function findUser(message, string, self = false) {
	string = string.toLowerCase()
	if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1]
	/** @type {Array<(user: Discord.User) => boolean>} */
	let matchFunctions = []
	matchFunctions = matchFunctions.concat([
		user => user.id == string,
		user => user.tag.toLowerCase() == string,
		user => user.username.toLowerCase() == string,
		user => user.username.toLowerCase().includes(string)
	])
	if (!string) {
		if (self) return message.author
		else return null
	} else {
		if (client.users.cache.get(string)) return client.users.cache.get(string)
		const list = []
		matchFunctions.forEach(i => client.users.cache.filter(u => i(u))
			.forEach(us => {
				if (!list.includes(us) && list.length < 10) list.push(us)
			}))
		if (list.length == 1) return list[0]
		if (list.length == 0) {
			if (validate(string)) {
				let d
				try {
					d = await client.users.fetch(string, true)
				} catch (e) {
					return null
				}
				return d
			} else return null
		}
		const embed = new Discord.MessageEmbed().setTitle("User selection").setDescription(list.map((item, i) => `${i + 1}. ${item.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E")
		const selectmessage = await message.channel.send(contentify(message.channel, embed))
		const collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), { max: 1, time: 60000 })
		return collector.next.then(newmessage => {
			const index = Number(newmessage.content)
			if (!index || !list[index - 1]) return null
			selectmessage.delete()
			// eslint-disable-next-line no-empty-function
			if (message.channel.type != "dm") newmessage.delete().catch(() => {})
			return list[index - 1]
		}).catch(() => {
			embed.setTitle("User selection cancelled").setDescription("").setFooter("")
			selectmessage.edit(contentify(selectmessage.channel, embed))
			return null
		})
	}
}

/**
 * Find a channel in a guild
 * @param {Discord.Message} message Message Object
 * @param {string} string String to search channels by
 * @param {boolean} [self=false] If the function should return `message`.channel
 * @returns {Promise<Discord.TextChannel | Discord.VoiceChannel>}
 */
async function findChannel(message, string, self) {
	// eslint-disable-next-line no-async-promise-executor
	if (message.channel instanceof Discord.DMChannel) return null
	const permissions = message.channel.permissionsFor(client.user)
	string = string.toLowerCase()
	if (/<#(\d+)>/.exec(string)) string = /<#(\d+)>/.exec(string)[1]
	/** @type {Array<(channel: Discord.GuildChannel) => boolean>} */
	let matchFunctions = []
	matchFunctions = matchFunctions.concat([
		channel => channel.id == string,
		channel => channel.name.toLowerCase() == string,
		channel => channel.name.toLowerCase().includes(string)
	])
	if (!string) {
		if (self) return message.channel
		else return null
	} else {
		// @ts-ignore
		if (message.guild.channels.cache.get(string)) return message.guild.channels.cache.get(string)
		/** @type {Array<Discord.GuildChannel>} */
		const list = []
		const channels = message.guild.channels.cache.filter(c => c.type == "text" || c.type == "voice")
		matchFunctions.forEach(i => channels
			.filter(c => i(c))
			.forEach(ch => {
				if (!list.includes(ch) && list.length < 10) list.push(ch)
			}))
		// @ts-ignore
		if (list.length == 1) return list[0]
		if (list.length == 0) return null
		const embed = new Discord.MessageEmbed().setTitle("Channel selection").setDescription(list.map((item, i) => `${item.type == "voice" ? "<:voice:674569797278760961>" : "<:text:674569797278892032>"} ${i + 1}. ${item.name}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E")
		const selectmessage = await message.channel.send(contentify(message.channel, embed))
		const collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), { max: 1, time: 60000 })
		return collector.next.then(newmessage => {
			const index = Number(newmessage.content)
			if (!index || !list[index - 1]) return null
			selectmessage.delete()
			// eslint-disable-next-line no-empty-function
			newmessage.delete().catch(() => {})
			return list[index - 1]
		}).catch(() => {
			embed.setTitle("Channel selection cancelled").setDescription("").setFooter("")
			selectmessage.edit(contentify(selectmessage.channel, embed))
			return null
		})
	}
}

/**
 * Validates if a string is *possibly* a valid Snowflake
 * @param {string} id
 */
function validate(id) {
	if (!(/^\d+$/.test(id))) return false

	const deconstructed = Discord.SnowflakeUtil.deconstruct(id)
	if (!deconstructed || !deconstructed.date) return false
	if (deconstructed.date.getTime() > Date.now()) return false
	return true
}
/**
 * Returns a user if possible or an Array of Members from a guild
 * @param {string} search
 * @param {Discord.Guild} guild
 * @param {number} [limit=10]
 */
async function fetch(search, guild, limit = 10) {
	/** @type {"id" | "username" | "tag"} */
	let mode
	const discrimregex = /#\d{4}$/
	if (search.match(discrimregex)) mode = "tag"
	else if (validate(search)) mode = "id"
	else mode = "username"

	if (mode == "id") {
		if (guild.members.cache.get(search)) return guild.members.cache.get(search)
		let d
		try {
			d = await guild.members.fetch(search)
		} catch (e) {
			return null
		}
		return d
	} else {
		let payload, discrim
		if (mode == "tag") {
			payload = search.replace(discrimregex, "")
			discrim = /#(\d{4})$/.exec(search)[1]
		} else payload = search
		let data
		try {
			data = await guild.members.fetch({ query: payload, limit: limit, withPresences: false })
		} catch (e) {
			return null
		}
		if (!data) return null
		const matchdiscrim = mode == "tag" ? data.find(m => m.user.discriminator == discrim) : undefined
		if (matchdiscrim) return matchdiscrim
		else if (mode == "tag" && !matchdiscrim) return null
		else {
			if (data.size == 1) return data.first()
			else return data.array()
		}
	}
}

module.exports.findMember = findMember
module.exports.findUser = findUser
module.exports.findChannel = findChannel
module.exports.cacheManager = { validate, fetch }
