// @ts-check

const Discord = require("thunderstorm")

const passthrough = require("../../passthrough")
const { client, constants } = passthrough

const { contentify, createMessageCollector } = require("./discordutils")

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
		/** @type {import("@amanda/discordtypings").ChannelData} */
		// @ts-ignore
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
		if (d) await passthrough.workers.cache.getData({ op: "SAVE_DATA", params: { type: "CHANNEL", data: d } })
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
			const match = /<#(\d+)>/.exec(string)
			if (match && match[1]) {
				string = match[1]
				const d = await channelManager.get(string, true, true)
				// @ts-ignore
				return res(d)
			}
			if (!string) {
				// @ts-ignore
				if (self) return channelManager.get(message.channel.id, true, true).then(data => res(data))
				else return res(null)
			} else {
				const channeldata = await channelManager.filter(string, message.guild.id)
				if (!channeldata) return res(null)
				/** @type {Array<Discord.TextChannel | Discord.VoiceChannel>} */
				const list = []
				const channels = channeldata.filter(chan => chan.type == 0 || chan.type == 2)
				for (const chan of channels) {
					if (list.find(item => item.id === chan.id) || list.length === 10) continue
					// @ts-ignore
					list.push(channelManager.parse(chan))
				}
				if (list.length == 1) return res(list[0])
				if (list.length == 0) return res(null)
				const embed = new Discord.MessageEmbed().setTitle("Channel selection").setDescription(list.map((item, i) => `${item.type == "voice" ? "<:voice:674569797278760961>" : "<:text:674569797278892032>"} ${i + 1}. ${item.name}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor(constants.standard_embed_color)
				const selectmessage = await message.channel.send(await contentify(message.channel, embed))
				const cb = (newmessage) => {
					const index = Number(newmessage.content)
					if (!index || !list[index - 1]) return onFail()
					selectmessage.delete()
					// eslint-disable-next-line no-empty-function
					newmessage.delete().catch(() => {})
					return res(list[index - 1])
				}
				// eslint-disable-next-line no-inner-declarations
				async function onFail() {
					embed.setTitle("Channel selection cancelled").setDescription("").setFooter("")
					selectmessage.edit(await contentify(selectmessage.channel, embed))
					return res(null)
				}
				createMessageCollector({ channelID: message.channel.id, userIDs: [message.author.id] }, cb, onFail)
			}
		})
	},
	/**
	 * @param {string} [search]
	 * @param {string} [guild_id]
	 * @param {number} [limit]
	 */
	filter: async function(search, guild_id, limit = 10) {
		const payload = {
			id: search,
			name: search,
			limit
		}
		if (guild_id) payload.guild_id = guild_id
		const ds = await passthrough.workers.cache.getData({ op: "FILTER_CHANNELS", params: payload })
		return ds
	},
	parse: function(channel) {
		const type = channel.type
		if (type == 0) return new Discord.TextChannel(channel, client)
		else if (type == 1) return new Discord.DMChannel(channel, client)
		else if (type == 2) return new Discord.VoiceChannel(channel, client)
		else if (type == 4) return new Discord.CategoryChannel(channel, client)
		else if (type == 5) return new Discord.NewsChannel(channel, client)
		else return new Discord.Channel(channel, client)
	},
	/**
	 * @param {{ id: string }} channel
	 */
	typeOf: async function(channel) {
		const chan = await channelManager.get(channel.id, true, false)
		if (chan) {
			if (chan.type == 0) return "text"
			else if (chan.type == 1) return "dm"
			else if (chan.type == 2) return "voice"
			else if (chan.type == 4) return "category"
			else if (chan.type == 5) return "news"
			else if (chan.type == 6) return "store"
			else return "text"
		} else return "text"
	},
	/**
	 * @param {{ id: string }} channel
	 */
	getOverridesFor: async function(channel) {
		const value = { allow: 0x00000000, deny: 0x00000000 }
		const perms = await client.rain.cache.permOverwrite.get(client.user.id, channel.id)
		if (perms) {
			// @ts-ignore
			value.allow |= (perms.allow || 0)
			// @ts-ignore
			value.deny |= (perms.deny || 0)
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


		const clientperms = await memberManager.permissionsFor(client.user.id, channel.guild_id)

		value.allow |= clientperms.allow
		value.deny |= clientperms.deny

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
		return (permissions.deny & toCheck) ? false : true
	}
}

const userManager = {
	/**
	 * @param {string} id
	 * @param {boolean} [fetch]
	 * @param {boolean} [convert]
	 */
	get: async function(id, fetch = false, convert = true) {
		let d = await client.rain.cache.user.get(id)
		if (d) {
			const o = d.boundObject ? d.boundObject : d
			// @ts-ignore
			if (!o.username) d = await userManager.fetch(id)
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
		if (d) await passthrough.workers.cache.getData({ op: "SAVE_DATA", params: { type: "USER", data: d } })
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
			const match = /<@!?(\d+)>/.exec(string)
			if (match && match[1]) {
				string = match[1]
				const d = await userManager.get(string, true, true)
				// @ts-ignore
				return res(d)
			}
			if (!string) {
				if (self) return res(message.author)
				else return res(null)
			} else {
				const userdata = await userManager.filter(string)
				const list = []
				if (userdata) {
					for (const user of userdata) {
						if (list.find(item => item.id === user.id) || list.length === 10) continue
						// @ts-ignore
						list.push(new Discord.User(user, client))
					}
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
					if (!index || !list[index - 1]) return onFail()
					selectmessage.delete()
					// eslint-disable-next-line no-empty-function
					if (message.channel.type != "dm") newmessage.delete().catch(() => {})
					return res(list[index - 1])
				}
				// eslint-disable-next-line no-inner-declarations
				async function onFail() {
					embed.setTitle("User selection cancelled").setDescription("").setFooter("")
					selectmessage.edit(await contentify(selectmessage.channel, embed))
					return res(null)
				}
				createMessageCollector({ channelID: message.channel.id, userIDs: [message.author.id] }, cb, onFail)
			}
		})
	},
	/**
	 * @param {string} search
	 * @param {number} [limit]
	 */
	filter: async function(search, limit = 10) {
		const ds = await passthrough.workers.cache.getData({ op: "FILTER_USERS", params: { username: search, id: search, discriminator: search, tag: search, limit } })
		return ds
	},
	parse: function(user) {
		return new Discord.User(user, client)
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
		const roles = []
		if (md && ud) {
			Object.assign(md, { user: ud })
			if (convert) return memberManager.parse({ roles, ...md })
			else return { roles, ...md }
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
		// @ts-ignore
		return (md && ud) ? { id: ud.id, guild_id: guildID, user: ud, ...md } : null
	},
	/**
	 * @param {Discord.Message} message Message Object
	 * @param {string} string String to search members by
	 * @param {boolean} [self=false] If the function should return the `message` author's member Object
	 * @returns {Promise<?Discord.GuildMember>}
	 */
	find: function(message, string, self = false) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async (res) => {
			string = string.toLowerCase()
			const match = /<@!?(\d+)>/.exec(string)
			if (match && match[1]) {
				string = match[1]
				const d = await memberManager.get(string, message.guild.id, true, true)
				// @ts-ignore
				return res(d)
			}

			if (!string) {
				if (self) return res(message.member)
				else return res(null)
			} else {
				const memdata = await memberManager.filter(string, message.guild.id)

				/** @type {Array<Discord.GuildMember>} */
				const list = []
				for (const member of memdata) {
					if (list.find(item => item.id === member.id) || list.length === 10) continue
					if (!member.user) member.user = await userManager.get(member.id, true, false)
					list.push(new Discord.GuildMember(member, client))
				}
				if (list.length == 1) return res(list[0])
				if (list.length == 0) return res(null)
				const embed = new Discord.MessageEmbed().setTitle("Member selection").setDescription(list.map((item, i) => `${i + 1}. ${item.user.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor(constants.standard_embed_color)
				const selectmessage = await message.channel.send(await contentify(message.channel, embed))
				const cb = (newmessage) => {
					const index = Number(newmessage.content)
					if (!index || !list[index - 1]) return onFail()
					selectmessage.delete()
					// eslint-disable-next-line no-empty-function
					newmessage.delete().catch(() => {})
					return res(list[index - 1])
				}
				// eslint-disable-next-line no-inner-declarations
				async function onFail() {
					embed.setTitle("Member selection cancelled").setDescription("").setFooter("")
					selectmessage.edit(await contentify(message.channel, embed))
					return res(null)
				}
				createMessageCollector({ channelID: message.channel.id, userIDs: [message.author.id] }, cb, onFail)
			}
		})
	},
	/**
	 * @param {string} search
	 * @param {string} [guild_id]
	 * @param {number} [limit]
	 */
	filter: async function(search, guild_id, limit = 10) {
		const payload = { nick: search, username: search, discriminator: search, id: search, tag: search, limit }
		if (guild_id) payload.guild_id = guild_id
		const ds = await passthrough.workers.cache.getData({ op: "FILTER_MEMBERS", params: payload })
		return ds
	},
	parse: function(member) {
		return new Discord.GuildMember(member, client)
	},
	/**
	 * @param {string} userID
	 * @param {string} guildID
	 */
	permissionsFor: async function(userID, guildID) {
		const value = { allow: 0x00000000, deny: 0x00000000 }

		const clientmemdata = await memberManager.get(userID, guildID, false, false) // get ClientUser member data in guild to get roles array
		if (!clientmemdata) return value

		/** @type {Array<string>} */
		const roles = clientmemdata.roles || []
		const roledata = await Promise.all(roles.map(id => client.rain.cache.role.get(id, guildID)))
		if (!roledata) return value
		for (const role of roledata) {
			if (!role) continue
			// @ts-ignore
			if (role.permissions) {
				// @ts-ignore
				value.allow |= role.permissions // OR together the permissions of each role
			}
		}

		return value
	},
	/**
	 * @param {string} userID
	 * @param {string} guildID
	 * @param {number | keyof permissionstable} permission
	 * @param {{ allow: number, deny: number }} [permissions]
	 */
	hasPermission: async function(userID, guildID, permission, permissions) {
		if (!guildID) return true
		if (!permissions) permissions = await memberManager.permissionsFor(userID, guildID)

		if (permissions.allow & permissionstable["ADMINISTRATOR"]) return true
		/** @type {Discord.Guild} */
		// @ts-ignore
		const g = await guildManager.get(guildID, true, true)
		if (g.ownerID === userID) return true

		/** @type {number} */
		let toCheck
		if (permissionstable[permission]) toCheck = permissionstable[permission]
		else if (typeof permission === "number") toCheck = permission
		// @ts-ignore
		else toCheck = permission

		if (permissions.allow & toCheck) return true
		else if (permissions.deny & toCheck) return false

		return (permissions.allow & toCheck) ? true : false
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
		if (d) await passthrough.workers.cache.getData({ op: "SAVE_DATA", params: { type: "GUILD", data: d } })
		return d || null
	},
	parse: function(guild) {
		return new Discord.Guild(guild, client)
	},
	/**
	 * @param {string} id
	 */
	async getOverridesFor(id) {
		const value = { allow: 0x00000000, deny: 0x00000000 }
		const guild = await guildManager.get(id, true, false)
		if (guild) {
			// @ts-ignore
			value.allow |= (guild.permissions || 0)
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

	const deconstructed = Discord.Util.SnowflakeUtil.deconstruct(id)
	if (!deconstructed || !deconstructed.timestamp) return false
	const date = new Date(deconstructed.timestamp)
	if (date.getTime() > Date.now()) return false
	return true
}

module.exports.cacheManager = { validate, users: userManager, channels: channelManager, members: memberManager, guilds: guildManager }
