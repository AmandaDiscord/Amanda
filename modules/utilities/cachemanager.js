// @ts-check

const Discord = require("thunderstorm")

const passthrough = require("../../passthrough")
const { client, constants } = passthrough

const { contentify, createMessageCollector, getUser, getChannelType } = require("./discordutils")

const SnowflakeUtil = require("discord.js/src/util/Snowflake")

/**
 * @param {Discord.Message} message Message Object
 * @param {string} string String to search members by
 * @param {boolean} [self=false] If the function should return the `message` author's member Object
 * @returns {?Promise<?Discord.GuildMember>}
 */
function findMember(message, string, self = false) {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (res) => {
		string = string.toLowerCase()
		if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1]

		if (!string) {
			if (self) return res(message.member)
			else return res(null)
		} else {
			const guildMemData = await client.rain.cache.member.filter(() => true, message.guild.id)
			const nicktest = guildMemData.find(mem => mem.boundObject.nick && mem.boundObject.nick.toLowerCase().includes(string))
			const userdata = await client.rain.cache.user.filter((user) => {
				const bO = !!(nicktest && nicktest.boundObject)
				const safeBo = bO ? nicktest.boundObject : { id: "" }
				return user.id.includes(string) || `${user.username}#${user.discriminator}`.toLowerCase() === string || user.username.toLowerCase() === string || user.username.toLowerCase().includes(string) || bO ? user.id === safeBo.id : false
			}, guildMemData.map(item => item.boundObject.id))

			/** @type {Array<Discord.GuildMember>} */
			let list = []
			for (const user of userdata) {
				console.log(user.boundObject)
				if (list.find(item => item.id === user.id) || list.length === 10) continue
				const memdata = await client.rain.cache.member.get(user.id, message.guild.id)
				console.log(memdata.boundObject)
				list.push(new Discord.GuildMember({ user: user.boundObject, ...memdata.boundObject }, client))
			}
			if (list.length == 1) return res(list[0])
			if (list.length == 0) {
				const fetched = await fetch(string, message.guild)
				if (!fetched) return res(null)
				if (Array.isArray(fetched)) {
					if (fetched.length == 0) return res(null)
					else list = fetched
				} else return res(fetched)
			}
			const embed = new Discord.MessageEmbed().setTitle("Member selection").setDescription(list.map((item, i) => `${i + 1}. ${item.user.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor(constants.standard_embed_color)
			const selectmessage = await message.channel.send(await contentify(message.channel, embed))
			createMessageCollector({ channelID: message.channel.id, userIDs: [message.author.id] }, (newmessage) => {
				const index = parseInt(newmessage.content)
				if (!index || !list[index - 1]) return null
				selectmessage.delete()
				// eslint-disable-next-line no-empty-function
				newmessage.delete().catch(() => {})
				return res(list[index - 1])
			}, async () => {
				embed.setTitle("Member selection cancelled").setDescription("").setFooter("")
				selectmessage.edit(await contentify(message.channel, embed))
				return res(null)
			})
		}
	})
}

/**
 * @param {Discord.Message} message Message Object
 * @param {string} string String to search users by
 * @param {boolean} [self=false] If the function should return the `message` author's user Object
 * @returns {Promise<?Discord.User>}
 */
function findUser(message, string, self = false) {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (res) => {
		string = string.toLowerCase()
		if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1]
		if (!string) {
			if (self) return res(message.author)
			else return res(null)
		} else {
			const userdata = await client.rain.cache.user.filter((user) => {
				return user.id.includes(string) || `${user.username}#${user.discriminator}`.toLowerCase() === string || user.username.toLowerCase() === string || user.username.toLowerCase().includes(string)
			})
			const list = []
			for (const user of userdata) {
				if (list.find(item => item.id === user.id) || list.length === 10) continue
				list.push(new Discord.User(user.boundObject, client))
			}
			if (list.length == 1) return res(list[0])
			if (list.length == 0) {
				if (validate(string)) {
					let d
					try {
						d = await getUser(string)
					} catch (e) {
						return res(null)
					}
					// @ts-ignore
					return res(d)
				} else return res(null)
			}
			const embed = new Discord.MessageEmbed().setTitle("User selection").setDescription(list.map((item, i) => `${i + 1}. ${item.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor(constants.standard_embed_color)
			const selectmessage = await message.channel.send(await contentify(message.channel, embed))
			createMessageCollector({ channelID: message.channel.id, userIDs: [message.author.id] }, (newmessage) => {
				const index = Number(newmessage.content)
				if (!index || !list[index - 1]) return res(null)
				selectmessage.delete()
				// eslint-disable-next-line no-empty-function
				if (message.channel.type != "dm") newmessage.delete().catch(() => {})
				return res(list[index - 1])
			}, async () => {
				embed.setTitle("User selection cancelled").setDescription("").setFooter("")
				selectmessage.edit(await contentify(selectmessage.channel, embed))
				return res(null)
			})
		}
	})
}

/**
 * Find a channel in a guild
 * @param {Discord.Message} message Message Object
 * @param {string} string String to search channels by
 * @param {boolean} [self=false] If the function should return `message`.channel
 * @returns {Promise<?Discord.TextChannel | Discord.VoiceChannel>}
 */
function findChannel(message, string, self) {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (res) => {
		if (await getChannelType(message.channel) === "dm") return null
		string = string.toLowerCase()
		if (/<#(\d+)>/.exec(string)) string = /<#(\d+)>/.exec(string)[1]
		if (!string) {
			if (self) return client.rain.cache.channel.get(message.channel.id).then(d => d && d.boundObject.type === 0 ? new Discord.TextChannel(d.boundObject, client) : d ? new Discord.VoiceChannel(d.boundObject, client) : null).then(res)
			else return res(null)
		} else {
			const channeldata = await client.rain.cache.channel.filter((channel) => {
				// @ts-ignore
				if (!channel.guild_id || (channel.guild_id && channel.guild_id === message.guild.id)) return false
				else return channel.id === string || channel.name.toLowerCase() === string || channel.name.toLowerCase().includes(string)
			})
			const list = []
			const channels = channeldata.filter(chan => chan.boundObject.type === 0 || chan.boundObject.type === 2)
			for (const chan of channels) {
				if (list.find(item => item.id === chan.boundObject.id) || list.length === 10) continue
				list.push(chan.boundObject.type === 0 ? new Discord.TextChannel(chan.boundObject, client) : new Discord.VoiceChannel(chan.boundObject, client))
			}
			if (list.length == 1) return res(list[0])
			if (list.length == 0) return res(null)
			const embed = new Discord.MessageEmbed().setTitle("Channel selection").setDescription(list.map((item, i) => `${item.type == "voice" ? "<:voice:674569797278760961>" : "<:text:674569797278892032>"} ${i + 1}. ${item.name}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor(constants.standard_embed_color)
			const selectmessage = await message.channel.send(await contentify(message.channel, embed))
			createMessageCollector({ channelID: message.channel.id, userIDs: [message.author.id] }, (newmessage) => {
				const index = Number(newmessage.content)
				if (!index || !list[index - 1]) return res(null)
				selectmessage.delete()
				// eslint-disable-next-line no-empty-function
				newmessage.delete().catch(() => {})
				return res(list[index - 1])
			}, async () => {
				embed.setTitle("Channel selection cancelled").setDescription("").setFooter("")
				selectmessage.edit(await contentify(selectmessage.channel, embed))
				return res(null)
			})
		}
	})
}

/**
 * Validates if a string is *possibly* a valid Snowflake
 * @param {string} id
 */
function validate(id) {
	if (!(/^\d+$/.test(id))) return false

	const deconstructed = SnowflakeUtil.deconstruct(id)
	if (!deconstructed || !deconstructed.date) return false
	if (deconstructed.date.getTime() > Date.now()) return false
	return true
}

/**
 * Returns a user if possible or an Array of Members from a guild
 * @param {string} search
 * @param {Discord.Message["guild"]} guild
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
		/** @type {Discord.GuildMember} */
		let d
		try {
			// @ts-ignore
			d = await guild.fetchMembers(search)
		} catch (e) {
			return null
		}
		// @ts-ignore
		if (d) await client.rain.cache.member.update(search, guild.id, d.toJSON())
		return d
	} else {
		let payload, discrim
		if (mode == "tag") {
			payload = search.replace(discrimregex, "")
			discrim = /#(\d{4})$/.exec(search)[1]
		} else payload = search
		/** @type {Array<Discord.GuildMember>} */
		let data
		try {
			// @ts-ignore
			data = await guild.fetchMembers({ query: payload, limit: limit })
		} catch (e) {
			return null
		}
		if (!data) return null
		for (const entry of data) {
			// @ts-ignore
			await client.rain.cache.member.update(entry.id, guild.id, entry.toJSON())
		}
		const matchdiscrim = mode == "tag" ?
			Array.isArray(data) ? data.find(m => m.user.discriminator == discrim) : undefined :
			undefined
		if (matchdiscrim) return matchdiscrim
		else if (mode == "tag" && !matchdiscrim) return null
		else {
			if (Array.isArray(data) && data.length == 1) return data[0]
			else return data
		}
	}
}

module.exports.findMember = findMember
module.exports.findUser = findUser
module.exports.findChannel = findChannel
module.exports.cacheManager = { validate, fetch }
