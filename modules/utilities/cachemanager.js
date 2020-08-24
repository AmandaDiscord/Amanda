// @ts-check

const Discord = require("thunderstorm")

const passthrough = require("../../passthrough")
const { client, constants } = passthrough

const { contentify, createMessageCollector } = require("./discordutils")

const SnowflakeUtil = require("discord.js/src/util/Snowflake")

const permissionstable = {
	CREATE_INSTANT_INVITE: 0x00000001,
	KICK_MEMBERS: 0x00000002,
	BAN_MEMBERS: 0x00000004,
	ADMINISTRATOR: 0x00000008,
	MANAGE_CHANNELS: 0x00000010,
	MANAGE_GUILD: 0x00000020,
	ADD_REACTIONS: 0x00000040,
	VIEW_AUDIT_LOG: 0x00000080,
	PRIORITY_SPEAKER: 0x00000100,
	STREAM: 0x00000200,
	VIEW_CHANNEL: 0x00000400,
	SEND_MESSAGES: 0x00000800,
	SEND_TTS_MESSAGES: 0x00001000,
	MANAGE_MESSAGES: 0x00002000,
	EMBED_LINKS: 0x00004000,
	ATTACH_FILES: 0x00008000,
	READ_MESSAGE_HISTORY: 0x00010000,
	MENTION_EVERYONE: 0x00020000,
	USE_EXTERNAL_EMOJIS: 0x00040000,
	VIEW_GUILD_INSIGHTS: 0x00080000,
	CONNECT: 0x00100000,
	SPEAK: 0x00200000,
	MUTE_MEMBERS: 0x00400000,
	DEAFEN_MEMBERS: 0x00800000,
	MOVE_MEMBERS: 0x01000000,
	USE_VAD: 0x02000000,
	CHANGE_NICKNAME: 0x04000000,
	MANAGE_NICKNAMES: 0x08000000,
	MANAGE_ROLES: 0x10000000,
	MANAGE_WEBHOOKS: 0x20000000,
	MANAGE_EMOJIS: 0x40000000,
	ALL: 0x00000000
}

for (const key of Object.keys(permissionstable)) {
	if (key === "ALL") continue
	permissionstable["ALL"] = permissionstable["ALL"] | permissionstable[key]
}

const channelManager = {
	/**
	 * @param {string} id
	 * @param {boolean} [fetch]
	 * @param {boolean} [convert]
	 */
	get: async function(id, fetch = false, convert = true) {
		const d = await client.rain.cache.channel.get(id)
		if (d) {
			if (convert) return channelManager.parse(d)
			else return d
		} else {
			if (fetch) {
				const fetched = await channelManager.fetch(id)
				if (fetched) {
					// @ts-ignore
					if (convert) return channelManager.parse(fetched)
					else return fetched
				} else return null
			} else return null
		}
	},
	/**
	 * @param {string} id
	 */
	fetch: async function(id) {
		const d = await client._snow.channel.getChannel(id)
		if (d) await client.rain.cache.channel.update(id, d)
		return d || null
	},
	/**
	 * Find a channel in a guild
	 * @param {Discord.Message} message Message Object
	 * @param {string} string String to search channels by
	 * @param {boolean} [self=false] If the function should return `message`.channel
	 * @returns {Promise<?Discord.TextChannel | Discord.VoiceChannel>}
	 */
	find: function(message, string, self) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async (res) => {
			// @ts-ignore
			if (await channelManager.typeOf(message.channel) === "dm") return res(null)
			string = string.toLowerCase()
			if (/<#(\d+)>/.exec(string)) string = /<#(\d+)>/.exec(string)[1]
			if (!string) {
				// @ts-ignore
				if (self) return channelManager.get(message.channel.id, true, true).then(data => res(data))
				else return res(null)
			} else {
				// @ts-ignore
				const inGuild = await channelManager.filter(chan => chan.guild_id && chan.guild_id === message.guild.id)
				// @ts-ignore
				const channeldata = await channelManager.filter(string, inGuild.map(c => c.boundObject ? c.boundObject.id : c.id))
				if (!channeldata) return res(null)
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
				const cb = (newmessage) => {
					const index = Number(newmessage.content)
					if (!index || !list[index - 1]) return res(null)
					selectmessage.delete()
					// eslint-disable-next-line no-empty-function
					newmessage.delete().catch(() => {})
					return res(list[index - 1])
				}
				const onFail = async () => {
					embed.setTitle("Channel selection cancelled").setDescription("").setFooter("")
					selectmessage.edit(await contentify(selectmessage.channel, embed))
					return res(null)
				}
				createMessageCollector({ channelID: message.channel.id, userIDs: [message.author.id] }, cb, onFail)
			}
		})
	},
	/**
	 * @param {((channel: import("raincache/src/cache/ChannelCache") | import("@amanda/discordtypings").ChannelData) => boolean) | string} [fn]
	 * @param {Array<string>} [inList] Filter within a specific list of IDs only
	 */
	filter: async function(fn, inList = undefined) {
		/**
		 * @param {import("raincache/src/cache/ChannelCache") | import("@amanda/discordtypings").ChannelData} channel
		 * @returns {boolean}
		 */
		const defa = (channel) => {
			// @ts-ignore
			const bO = channel.boundObject ? channel.boundObject : channel
			if (bO.id.includes(fn)) return true
			else if (bO.name && bO.name.toLowerCase().includes(fn)) return true
			else return false
		}
		let data
		if (typeof fn === "string") data = await client.rain.cache.channel.filter(defa, inList)
		else data = await client.rain.cache.channel.filter(fn, inList)

		if (data && data.length > 0) return data
		else return null
	},
	/**
	 * @param {import("raincache/src/cache/ChannelCache") | import("@amanda/discordtypings").ChannelData} channel
	 */
	parse: function(channel) {
		// @ts-ignore
		const d = channel.boundObject ? channel.boundObject : channel
		const type = d.type
		if (type === 0) return new Discord.TextChannel(d, client)
		else if (type === 1) return new Discord.DMChannel(d, client)
		else if (type === 2) return new Discord.VoiceChannel(d, client)
		else if (type === 4) return new Discord.CategoryChannel(d, client)
		else if (type === 5) return new Discord.NewsChannel(d, client)
		else return new Discord.Channel(d, client)
	},
	/**
	 * @param {{ id: string }} channel
	 */
	typeOf: async function(channel) {
		const chan = await client.rain.cache.channel.get(channel.id)
		if (chan && chan.boundObject) {
			if (chan.boundObject.type === 0) return "text"
			else if (chan.boundObject.type === 1) return "dm"
			else if (chan.boundObject.type === 2) return "voice"
			else if (chan.boundObject.type === 4) return "category"
			else if (chan.boundObject.type === 5) return "news"
			else if (chan.boundObject.type === 6) return "store"
		} else return "text"
	},
	/**
	 * @param {{ id: string }} channel
	 */
	getOverridesFor: async function(channel) {
		const value = { allow: 0x00000000, deny: 0x00000000 }
		const perms = await client.rain.cache.permOverwrite.get(client.user.id, channel.id) // get permission overwrite data from cache
		if (perms) {
			const permbO = perms.boundObject ? perms.boundObject : perms // isolate overwrite object
			value.allow |= (permbO.allow || 0)
			value.deny |= (permbO.deny || 0)
		}
		return value
	},
	/**
	 * @param {{ id: string, guild_id: string }} channel
	 * @returns {Promise<{ allow: number, deny: number }>}
	 */
	permissionsFor: async function(channel) {
		const value = { allow: 0x00000000, deny: 0x00000000 }
		if (!channel.guild_id) return { allow: permissionstable["ALL"], deny: 0x00000000 }

		const chanperms = await channelManager.getOverridesFor(channel)
		const guildperms = await guildManager.getOverridesFor(channel.guild_id)

		value.allow |= chanperms.allow
		value.deny |= chanperms.deny

		value.allow |= guildperms.allow
		value.deny |= guildperms.deny


		const clientmemdata = await memberManager.get(client.user.id, channel.guild_id, false, false) // get ClientUser member data in guild to get roles array
		if (!clientmemdata) return value

		/** @type {Array<string>} */
		// @ts-ignore
		const roles = (clientmemdata.boundObject ? clientmemdata.boundObject.roles : clientmemdata.roles) // isolate ClientUser roles array
		const roledata = await Promise.all(roles.map(role => client.rain.cache.role.get(role, channel.guild_id))) // get all role data from cache
		for (const role of roledata) {
			const rbO = role.boundObject ? role.boundObject : role // isolate role object
			if (rbO.permissions) {
				value.allow |= rbO.permissions // OR together the permissions of each role
			}
		}

		return value
	},
	/**
	 * @param {{ id: string, guild_id: string }} channel
	 * @param {number | keyof permissionstable} permission
	 * @param {{ allow: number, deny: number }} [permissions]
	 */
	hasPermissions: async function(channel, permission, permissions) {
		if (!channel.guild_id) return true
		if (!permissions) permissions = await channelManager.permissionsFor(channel)

		/** @type {number} */
		let toCheck
		if (permissionstable[permission]) toCheck = permissionstable[permission]
		else if (typeof permission === "number") toCheck = permission
		// @ts-ignore
		else toCheck = permission

		if ((permissions.allow & toCheck) == toCheck) return true
		if ((permissions.deny & toCheck) == toCheck) return false
		else return true
	}
}

const userManager = {
	/**
	 * @param {string} id
	 * @param {boolean} [fetch]
	 * @param {boolean} [convert]
	 */
	get: async function(id, fetch = false, convert = true) {
		const d = await client.rain.cache.user.get(id)
		if (d) {
			if (convert) return userManager.parse(d)
			else return d
		} else {
			if (fetch) {
				const fetched = await userManager.fetch(id)
				if (fetched) {
					if (convert) return userManager.parse(fetched)
					else return fetched
				} else return null
			} else return null
		}
	},
	/**
	 * @param {string} id
	 */
	fetch: async function(id) {
		const d = await client._snow.user.getUser(id)
		if (d) await client.rain.cache.user.update(id, d)
		return d || null
	},
	/**
	 * @param {Discord.Message} message Message Object
	 * @param {string} string String to search users by
	 * @param {boolean} [self=false] If the function should return the `message` author's user Object
	 * @returns {Promise<?Discord.User>}
	 */
	find: function(message, string, self = false) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async (res) => {
			string = string.toLowerCase()
			if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1]
			if (!string) {
				if (self) return res(message.author)
				else return res(null)
			} else {
				const userdata = await userManager.filter(string)
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
							d = await userManager.get(string, true)
						} catch (e) {
							return res(null)
						}
						// @ts-ignore
						return res(d)
					} else return res(null)
				}
				const embed = new Discord.MessageEmbed().setTitle("User selection").setDescription(list.map((item, i) => `${i + 1}. ${item.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor(constants.standard_embed_color)
				const selectmessage = await message.channel.send(await contentify(message.channel, embed))
				const cb = (newmessage) => {
					const index = Number(newmessage.content)
					if (!index || !list[index - 1]) return res(null)
					selectmessage.delete()
					// eslint-disable-next-line no-empty-function
					if (message.channel.type != "dm") newmessage.delete().catch(() => {})
					return res(list[index - 1])
				}
				const onFail = async () => {
					embed.setTitle("User selection cancelled").setDescription("").setFooter("")
					selectmessage.edit(await contentify(selectmessage.channel, embed))
					return res(null)
				}
				createMessageCollector({ channelID: message.channel.id, userIDs: [message.author.id] }, cb, onFail)
			}
		})
	},
	/**
	 * @param {((user: import("raincache/src/cache/UserCache") | import("@amanda/discordtypings").UserData) => boolean) | string} [fn]
	 * @param {Array<string>} [inList] Filter within a specific list of IDs only
	 */
	filter: async function(fn, inList = undefined) {
		/**
		 * @param {import("raincache/src/cache/UserCache") | import("@amanda/discordtypings").UserData} user
		 * @returns {boolean}
		 */
		const defa = (user) => {
			// @ts-ignore
			const bO = user.boundObject ? user.boundObject : user
			return bO.id.includes(fn) || `${bO.username}#${bO.discriminator}`.toLowerCase() === fn || bO.username.toLowerCase() === fn || bO.username.toLowerCase().includes(fn)
		}
		let data
		if (typeof fn === "string") data = await client.rain.cache.user.filter(defa, inList)
		else data = await client.rain.cache.user.filter(fn, inList)

		if (data && data.length > 0) return data
		else return null
	},
	/**
	 * @param {import("raincache/src/cache/UserCache") | import("@amanda/discordtypings").UserData} user
	 */
	parse: function(user) {
		// @ts-ignore
		const d = user.boundObject ? user.boundObject : user
		return new Discord.User(d, client)
	}
}

const memberManager = {
	/**
	 * @param {string} id
	 * @param {string} guildID
	 * @param {boolean} [fetch]
	 * @param {boolean} [convert]
	 */
	get: async function(id, guildID, fetch = false, convert = true) {
		const [md, ud] = await Promise.all([
			client.rain.cache.member.get(id, guildID),
			userManager.get(id, true, false)
		])
		if (md && ud) {
			// @ts-ignore
			const sud = ud.boundObject ? ud.boundObject : ud
			if (convert) return memberManager.parse(md, sud)
			else return { user: sud, ...md }
		} else {
			if (fetch) {
				const fetched = await memberManager.fetch(id, guildID)
				if (fetched) {
					// @ts-ignore
					if (convert) return memberManager.parse(fetched, fetched.user)
					else return fetched
				} else return null
			} else return null
		}
	},
	/**
	 * @param {string} id
	 * @param {string} guildID
	 */
	fetch: async function(id, guildID) {
		const md = await client._snow.guild.getGuildMember(guildID, id)
		const ud = await userManager.get(id, true, false)
		if (md && ud) await client.rain.cache.member.update(id, guildID, { id: ud.id, guild_id: guildID, user: ud, ...md })
		return (md && ud) ? { id: ud.id, guild_id: guildID, user: ud, ...md } : null
	},
	/**
	 * Returns a user if possible or an Array of Members from a guild
	 * @param {string} search
	 * @param {Discord.Message["guild"]} guild
	 * @param {number} [limit=10]
	 */
	fetchMembers: async function(search, guild, limit = 10) {
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
	},
	/**
	 * @param {Discord.Message} message Message Object
	 * @param {string} string String to search members by
	 * @param {boolean} [self=false] If the function should return the `message` author's member Object
	 * @returns {?Promise<?Discord.GuildMember>}
	 */
	find: function(message, string, self = false) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async (res) => {
			string = string.toLowerCase()
			if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1]

			if (!string) {
				if (self) return res(message.member)
				else return res(null)
			} else {
				const guildMemData = await client.rain.cache.member.filter(() => true, message.guild.id)
				const nicktest = guildMemData.filter(mem => mem.boundObject.nick && mem.boundObject.nick.toLowerCase().includes(string))
				const userdata = await client.rain.cache.user.filter((user) => {
					// @ts-ignore
					const userb = user.boundObject ? user.boundObject : user
					// @ts-ignore
					const nickb = nicktest.find(m => (m.boundObject ? m.boundObject.id : m.id) === userb.id)
					if (nickb) return true
					else if (userb.id.includes(string)) return true
					else if (`${userb.username}#${userb.discriminator}`.toLowerCase() === string) return true
					else if (userb.username.toLowerCase() === string) return true
					else if (userb.username.toLowerCase().includes(string)) return true
					else return false
				}, guildMemData.map(item => item.boundObject.id))

				/** @type {Array<Discord.GuildMember>} */
				let list = []
				for (const user of userdata) {
					if (list.find(item => item.id === user.id) || list.length === 10) continue
					// @ts-ignore
					const memdata = guildMemData.find(m => (m.boundObject ? m.boundObject.id : m.id) === user.id)
					list.push(new Discord.GuildMember({ user: user.boundObject ? user.boundObject : user, ...(memdata.boundObject ? memdata.boundObject : memdata) }, client))
				}
				if (list.length == 1) return res(list[0])
				if (list.length == 0) {
					// @ts-ignore
					const fetched = await memberManager.fetchMembers(string, message.guild)
					if (!fetched) return res(null)
					if (Array.isArray(fetched)) {
						if (fetched.length == 0) return res(null)
						else list = fetched
					} else return res(fetched)
				}
				const embed = new Discord.MessageEmbed().setTitle("Member selection").setDescription(list.map((item, i) => `${i + 1}. ${item.user.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor(constants.standard_embed_color)
				const selectmessage = await message.channel.send(await contentify(message.channel, embed))
				const cb = (newmessage) => {
					const index = parseInt(newmessage.content)
					if (!index || !list[index - 1]) return null
					selectmessage.delete()
					// eslint-disable-next-line no-empty-function
					newmessage.delete().catch(() => {})
					return res(list[index - 1])
				}
				const onFail = async () => {
					embed.setTitle("Member selection cancelled").setDescription("").setFooter("")
					selectmessage.edit(await contentify(message.channel, embed))
					return res(null)
				}
				createMessageCollector({ channelID: message.channel.id, userIDs: [message.author.id] }, cb, onFail)
			}
		})
	},
	/**
	 * @param {((member: import("raincache/src/cache/MemberCache") | import("@amanda/discordtypings").MemberData) => boolean) | string} [fn]
	 * @param {string} [guild_id]
	 * @param {Array<string>} [inList] Filter within a specific list of IDs only
	 */
	filter: async function(fn, guild_id, inList = undefined) {
		/**
		 * @param {import("raincache/src/cache/MemberCache") | import("@amanda/discordtypings").MemberData} member
		 * @returns {boolean}
		 */
		const defa = (member) => {
			// @ts-ignore
			const bO = member.boundObject ? member.boundObject : member
			return bO.id.includes(fn) || bO.nick ? bO.nick.toLowerCase() === fn : false || bO.nick ? bO.nick.toLowerCase().includes(fn) : false
		}
		let data
		if (typeof fn === "string") data = await client.rain.cache.member.filter(defa, guild_id, inList)
		else data = await client.rain.cache.member.filter(fn, guild_id, inList)

		if (data && data.length > 0) return data
		else return null
	},
	/**
	 * @param {import("raincache/src/cache/MemberCache") | import("@amanda/discordtypings").MemberData} member
	 * @param {import("raincache/src/cache/UserCache") | import("@amanda/discordtypings").UserData} user
	 */
	parse: function(member, user) {
		// @ts-ignore
		const md = member.boundObject ? member.boundObject : member
		// @ts-ignore
		const ud = user.boundObject ? user.boundObject : user
		return new Discord.GuildMember({ user: ud, ...md }, client)
	}
}

const guildManager = {
	/**
	 * @param {string} id
	 * @param {boolean} [fetch]
	 * @param {boolean} [convert]
	 */
	get: async function(id, fetch = false, convert = true) {
		const d = await client.rain.cache.guild.get(id)
		if (d) {
			if (convert) return guildManager.parse(d) // fetching all members, channels and userdata took too long so the Guild#channels and Guild#members Maps will be empty
			else return d
		} else {
			if (fetch) {
				const fetched = await guildManager.fetch(id)
				if (fetched) {
					// @ts-ignore
					if (convert) return guildManager.parse(fetched)
					else return fetched
				} else return null
			} else return null
		}
	},
	/**
	 * @param {string} id
	 */
	fetch: async function(id) {
		const d = await client._snow.guild.getGuild(id)
		// @ts-ignore
		if (d) await client.rain.cache.guild.update(id, d)
		return d || null
	},
	/**
	 * @param {import("raincache/src/cache/GuildCache") | import("@amanda/discordtypings").GuildData} guild
	 */
	parse: function(guild) {
		// @ts-ignore
		const d = guild.boundObject ? guild.boundObject : guild
		// @ts-ignore
		return new Discord.Guild(d, client)
	},
	/**
	 * @param {string} id
	 */
	async getOverridesFor(id) {
		const value = { allow: 0x00000000, deny: 0x00000000 }
		const guild = await guildManager.get(id, true, false)
		if (guild) {
			// @ts-ignore
			const gbO = guild.boundObject ? guild.boundObject : guild
			value.allow |= (gbO.permissions || 0)
		}
		return value
	}
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

module.exports.cacheManager = { validate, users: userManager, channels: channelManager, members: memberManager, guilds: guildManager }
