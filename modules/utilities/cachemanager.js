// @ts-check

const Discord = require("thunderstorm")
const path = require("path")

const passthrough = require("../../passthrough")
const { client, config, constants, reloader } = passthrough

const { contentify, createMessageCollector } = require("./discordutils")
const sql = require("./sql")
const { db } = require("./orm")

const permissionstable = {
	CREATE_INSTANT_INVITE: BigInt(0x00000001),
	KICK_MEMBERS: BigInt(0x00000002),
	BAN_MEMBERS: BigInt(0x00000004),
	ADMINISTRATOR: BigInt(0x00000008),
	MANAGE_CHANNELS: BigInt(0x00000010),
	MANAGE_GUILD: BigInt(0x00000020),
	ADD_REACTIONS: BigInt(0x00000040),
	VIEW_AUDIT_LOG: BigInt(0x00000080),
	PRIORITY_SPEAKER: BigInt(0x00000100),
	STREAM: BigInt(0x00000200),
	VIEW_CHANNEL: BigInt(0x00000400),
	SEND_MESSAGES: BigInt(0x00000800),
	SEND_TTS_MESSAGES: BigInt(0x00001000),
	MANAGE_MESSAGES: BigInt(0x00002000),
	EMBED_LINKS: BigInt(0x00004000),
	ATTACH_FILES: BigInt(0x00008000),
	READ_MESSAGE_HISTORY: BigInt(0x00010000),
	MENTION_EVERYONE: BigInt(0x00020000),
	USE_EXTERNAL_EMOJIS: BigInt(0x00040000),
	VIEW_GUILD_INSIGHTS: BigInt(0x00080000),
	CONNECT: BigInt(0x00100000),
	SPEAK: BigInt(0x00200000),
	MUTE_MEMBERS: BigInt(0x00400000),
	DEAFEN_MEMBERS: BigInt(0x00800000),
	MOVE_MEMBERS: BigInt(0x01000000),
	USE_VAD: BigInt(0x02000000),
	CHANGE_NICKNAME: BigInt(0x04000000),
	MANAGE_NICKNAMES: BigInt(0x08000000),
	MANAGE_ROLES: BigInt(0x10000000),
	MANAGE_WEBHOOKS: BigInt(0x20000000),
	MANAGE_EMOJIS: BigInt(0x40000000),
	ALL: BigInt(0x00000000)
}

for (const key of Object.keys(permissionstable)) {
	if (key === "ALL") continue
	permissionstable["ALL"] |= permissionstable[key]
}

function upsertChannel(channel, guild_id) {
	db.upsert("channels", { id: channel.id, type: channel.type, guild_id: guild_id, name: channel.name })

	for (const overwrite of channel.permission_overwrites || []) {
		db.upsert("channel_overrides", { id: overwrite.id, type: overwrite.type, allow: overwrite.allow, deny: overwrite.deny, guild_id: guild_id, channel_id: channel.id })
	}
}

function upsertMember(member, guild_id) {
	if (!member.user || (member.user && !member.user.id)) return
	db.upsert("members", { id: member.user.id, guild_id: guild_id, nick: member.nick || null, joined_at: member.joined_at })
	for (const role of member.roles || []) {
		db.upsert("member_roles", { id: member.user.id, guild_id: guild_id, role_id: role })
	}
	upsertUser(member.user)
}

function upsertUser(user) {
	db.upsert("users", { id: user.id, tag: `${user.username}#${user.discriminator}`, avatar: user.avatar || null, bot: user.bot ? 1 : 0, added_by: config.cluster_id })
}

/**
 * @param {import("thunderstorm/src/internal").InboundDataType} data
 */
function processData(data) {
	const empty = []
	switch (data.t) {
	case "GUILD_CREATE":
	case "GUILD_UPDATE": {
		db.upsert("guilds", { id: data.d.id, name: data.d.name, icon: data.d.icon, member_count: data.d.member_count || 2, owner_id: data.d.owner_id, permissions: data.d.permissions || 0, region: data.d.region, added_by: config.cluster_id })

		for (const channel of data.d.channels || empty) {
			upsertChannel(channel, data.d.id)
		}

		for (const role of data.d.roles || empty) {
			db.upsert("roles", { id: role.id, permissions: role.permissions, guild_id: data.d.id })
		}

		for (const member of data.d.members || empty) {
			upsertMember(member, data.d.id)
		}

		for (const state of data.d.voice_states || empty) {
			db.upsert("voice_states", { guild_id: data.d.id, channel_id: state.channel_id, user_id: state.channel_id })
		}
		break
	}
	case "GUILD_DELETE": {
		if (!data.d.unavailable) sql.all("DELETE FROM guilds WHERE id = $1; DELETE FROM channels WHERE guild_id = $1; DELETE FROM members WHERE guild_id = $1; DELETE FROM member_roles WHERE guild_id = $1; DELETE FROM channel_overrides WHERE guild_id = $1; DELETE FROM roles WHERE guild_id = $1; DELETE FROM voice_states WHERE guild_id = $1", data.d.id)
		break
	}
	case "CHANNEL_CREATE":
	case "CHANNEL_UPDATE": {
		if (!data.d.guild_id) return
		upsertChannel(data.d, data.d.guild_id)
		break
	}
	case "CHANNEL_DELETE": {
		if (!data.d.guild_id) return
		sql.all("DELETE FROM channels WHERE id = $1; DELETE FROM channel_overrides WHERE channel_id = $1; DELETE FROM voice_states WHERE channel_id = $1", data.d.id)
		break
	}
	case "GUILD_MEMBER_ADD":
	case "GUILD_MEMBER_UPDATE": {
		upsertMember(data.d, data.d.guild_id)
		break
	}
	case "GUILD_MEMBER_DELETE": {
		sql.all("DELETE FROM members WHERE guild_id = $1 AND id = $2; DELETE FROM member_roles WHERE guild_id = $1 AND id = $2; DELETE FROM channel_overrides WHERE guild_id = $1 AND id = $1", [data.d.guild_id, data.d.user.id])
		break
	}
	case "GUILD_ROLE_CREATE":
	case "GUILD_ROLE_UPDATE": {
		db.upsert("roles", { id: data.d.role.id, guild_id: data.d.guild_id, permissions: data.d.role.permissions })
		break
	}
	case "GUILD_ROLE_DELETE": {
		db.delete("roles", { id: data.d.role_id })
		db.delete("member_roles", { role_id: data.d.role_id })
		break
	}
	case "MESSAGE_CREATE": {
		if (data.d.webhook_id) return
		const mdata = Object.assign({}, data.d.member, { user: data.d.author })
		if (data.d.member && data.d.author) upsertMember(mdata, data.d.guild_id) // Don't mutate data.d.member
		else if (data.d.author) upsertUser(data.d.author)

		if (data.d.mentions && data.d.mentions.length > 0 && data.d.guild_id) {
			data.d.mentions.map(user => {
				if (user.member) upsertMember(Object.assign({}, user.member, { user: user }), data.d.guild_id)
				else upsertUser(user)
			})
		}
		break
	}
	case "VOICE_STATE_UPDATE": {
		if (!data.d.guild_id) return
		if (data.d.member) upsertMember(data.d.member, data.d.guild_id)

		if (data.d.channel_id != null) db.upsert("voice_states", { guild_id: data.d.guild_id, channel_id: data.d.channel_id, user_id: data.d.user_id }, { useBuffer: false })
		else db.delete("voice_states", { user_id: data.d.user_id })
		break
	}
	default:
		break
	}
}

const channelManager = {
	/**
	 * @param {string} id
	 * @param {boolean} [fetch]
	 * @param {boolean} [convert]
	 */
	get: async function(id, fetch = false, convert = true) {
		const d = await db.get("channels", { id: id })
		if (d) {
			if (convert) return channelManager.parse(d)
			else return d
		} else {
			if (fetch) {
				const fetched = await channelManager.fetch(id)
				if (fetched) {
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
		// @ts-ignore
		if (d && d.id && d.guild_id) db.upsert("channels", { id: d.id, type: d.type, guild_id: d.guild_id, name: d.name })
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
				if (!channeldata.length) return res(null)
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
		const prepared = [`%${search.replace(/%/g, "\\%")}`]
		if (guild_id) prepared.push(guild_id)
		const ds = await sql.all(`SELECT * FROM channels WHERE (id LIKE $1 OR LOWER(name) LIKE LOWER($1))${guild_id ? " AND guild_id = $2" : ""} LIMIT ${limit}`, prepared)
		return ds || []
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
		const value = { allow: BigInt(0x00000000), deny: BigInt(0x00000000) }
		const perms = await db.get("channel_overrides", { id: channel.id })
		if (perms) {
			value.allow |= (perms.allow ? BigInt(perms.allow) : BigInt(0))
			value.deny |= (perms.deny ? BigInt(perms.deny) : BigInt(0))
		}
		return value
	},
	/**
	 * @param {{ id: string, guild_id: string }} channel
	 * @returns {Promise<{ allow: bigint, deny: bigint }>}
	 */
	permissionsFor: async function(channel) {
		const value = { allow: BigInt(0x00000000), deny: BigInt(0x00000000) }
		if (!channel.guild_id) return { allow: permissionstable["ALL"], deny: BigInt(0x00000000) }

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
	 * @param {bigint | keyof permissionstable} permission
	 * @param {{ allow: bigint, deny: bigint }} [permissions]
	 */
	hasPermissions: async function(channel, permission, permissions) {
		if (!channel.guild_id) return true
		if (!permissions) permissions = await channelManager.permissionsFor(channel)

		/** @type {bigint} */
		let toCheck
		if (permissionstable[permission]) toCheck = permissionstable[permission]
		else if (typeof permission === "bigint") toCheck = permission
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
	 * @returns {Promise<{ id: string, username: string, discriminator: string, avatar: string, bot: boolean, added_by: string } | Discord.User | import("@amanda/discordtypings").UserData>}
	 */
	get: async function(id, fetch = false, convert = true) {
		/** @type {{ id: string, tag: string, avatar: string, bot: boolean, added_by: string }} */
		// @ts-ignore
		const d = await db.get("users", { id: id })
		if (d) {
			const arr = d.tag.split("#")
			const username = arr.slice(0, arr.length - 1).join("#")
			const discriminator = arr[arr.length - 1]
			let obj = { username: username, discriminator: discriminator, ...d }
			obj.bot = !!d.bot
			delete obj.tag
			// @ts-ignore
			if (!obj.username) obj = await userManager.fetch(id)
			if (convert) return userManager.parse(obj)
			else return obj
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
		if (d) db.upsert("users", { id: d.id, tag: `${d.username}#${d.discriminator}`, avatar: d.avatar || null, bot: d.bot ? 1 : 0, added_by: config.cluster_id })
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
				const d = message.mentions.length === 1 ? message.mentions[0].user : message.mentions.find(item => item.id === string).user
				return res(d)
			}
			if (!string) {
				if (self) return res(message.author)
				else return res(null)
			} else {
				const userdata = await userManager.filter(string)
				const list = []
				if (!userdata.length) return res(null)
				for (const user of userdata) {
					if (list.find(item => item.id === user.id) || list.length === 10) continue
					list.push(userManager.parse(user))
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
		const ds = await sql.all(`SELECT * FROM users WHERE (LOWER(tag) LIKE LOWER($1) OR id LIKE $1) LIMIT ${limit}`, `%${search.replace(/%/g, "\\%")}`)
		return ds.map(r => {
			const arr = r.tag.split("#")
			const username = arr.slice(0, arr.length - 1).join("#")
			const discriminator = arr[arr.length - 1]
			const obj = { username: username, discriminator: discriminator, ...r }
			delete obj.tag
			obj.bot = !!r.bot
			return obj
		})
	},
	parse: function(user) {
		let obj = user
		if (user.tag) {
			const arr = user.tag.split("#")
			const username = arr.slice(0, arr.length - 1).join("#")
			const discriminator = arr[arr.length - 1]
			obj = { username: username, discriminator: discriminator, ...user }
			obj.bot = !!user.bot
			delete obj.tag
		}
		return new Discord.User(obj, client)
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
			db.get("members", { id: id, guild_id: guildID }),
			userManager.get(id, true, false)
		])
		const roles = await db.select("member_roles", { id: id })
		// @ts-ignore
		if (ud && ud.tag) {
			// @ts-ignore
			const arr = ud.tag.split("#")
			const username = arr.slice(0, arr.length - 1).join("#")
			const discriminator = arr[arr.length - 1]
			const obj = { username: username, discriminator: discriminator, ...ud }
			obj.bot = !!ud.bot
			// @ts-ignore
			delete obj.tag
		}
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
		let d
		// @ts-ignore
		if (ud && ud.tag) {
			// @ts-ignore
			const arr = ud.tag.split("#")
			const username = arr.slice(0, arr.length - 1).join("#")
			const discriminator = arr[arr.length - 1]
			const obj = { username: username, discriminator: discriminator, ...ud }
			obj.bot = !!ud.bot
			// @ts-ignore
			delete obj.tag
		}
		if (md && ud) {
			d = { id: ud.id, guild_id: guildID, user: ud, ...md }
			upsertMember(d, guildID)
		}
		return (md && ud) ? d : null
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
				const d = message.mentions.length === 1 ? message.mentions[0] : message.mentions.find(item => item.id === string)
				return res(d)
			}

			if (!string) {
				if (self) return res(message.member)
				else return res(null)
			} else {
				const memdata = await memberManager.filter(string, message.guild.id)

				/** @type {Array<Discord.GuildMember>} */
				const list = []
				if (!memdata.length) return res(null)
				for (const member of memdata) {
					if (list.find(item => item.id === member.id) || list.length === 10) continue
					// @ts-ignore
					if (!member.user) member.user = await userManager.get(member.id, true, false)
					list.push(memberManager.parse(member))
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
	 * @param {string} guild_id
	 * @param {number} [limit]
	 */
	filter: async function(search, guild_id, limit = 10) {
		const statement = `SELECT members.id, members.nick, members.joined_at, members.guild_id, users.tag, users.avatar, users.bot FROM users INNER JOIN members ON members.id = users.id WHERE (users.id LIKE $1 OR LOWER(users.tag) LIKE LOWER($1) OR LOWER(members.nick) LIKE LOWER($1)) AND members.guild_id = $2 LIMIT ${limit}`
		const prepared = [`${search.replace(/%/g, "\\%")}%`, guild_id]
		const ds = await sql.all(statement, prepared)
		return ds.map(m => {
			const arr = m.tag.split("#")
			const username = arr.slice(0, arr.length - 1).join("#")
			const discriminator = arr[arr.length - 1]
			return { id: m.id, nick: m.nick, joined_at: m.joined_at, guild_id: m.guild_id, user: { id: m.id, username: username, discriminator: discriminator, avatar: m.avatar, bot: m.bot } }
		})
	},
	parse: function(member) {
		if (member.user && member.user.tag && !(member.user instanceof Discord.User)) {
			// @ts-ignore
			const arr = member.user.tag.split("#")
			const username = arr.slice(0, arr.length - 1).join("#")
			const discriminator = arr[arr.length - 1]
			const obj = { username: username, discriminator: discriminator, ...member.user }
			obj.bot = !!member.user.bot
			// @ts-ignore
			delete obj.tag
			member.user = obj
		}
		return new Discord.GuildMember(member, client)
	},
	/**
	 * @param {string} userID
	 * @param {string} guildID
	 */
	permissionsFor: async function(userID, guildID) {
		const value = { allow: BigInt(0x00000000), deny: BigInt(0x00000000) }

		const roledata = await sql.all("SELECT roles.permissions FROM roles INNER JOIN member_roles ON roles.id = member_roles.role_id WHERE member_roles.id = $1 AND member_roles.guild_id = $2", [userID, guildID])
		if (!roledata.length) return value
		for (const role of roledata) {
			if (!role) continue
			if (role.permissions) {
				value.allow |= BigInt(role.permissions) // OR together the permissions of each role
			}
		}

		return value
	},
	/**
	 * @param {string} userID
	 * @param {string} guildID
	 * @param {bigint | keyof permissionstable} permission
	 * @param {{ allow: bigint, deny: bigint }} [permissions]
	 */
	hasPermission: async function(userID, guildID, permission, permissions) {
		if (!guildID) return true
		if (!permissions) permissions = await memberManager.permissionsFor(userID, guildID)

		if (permissions.allow & permissionstable["ADMINISTRATOR"]) return true
		/** @type {Discord.Guild} */
		// @ts-ignore
		const g = await guildManager.get(guildID, true, true)
		if (g.ownerID === userID) return true

		/** @type {bigint} */
		let toCheck
		if (permissionstable[permission]) toCheck = permissionstable[permission]
		else if (typeof permission === "bigint") toCheck = permission
		// @ts-ignore
		else toCheck = permission

		if (permissions.allow & toCheck) return true
		else if (permissions.deny & toCheck) return false
		else return true
	}
}

const guildManager = {
	/**
	 * @param {string} id
	 * @param {boolean} [fetch]
	 * @param {boolean} [convert]
	 */
	get: async function(id, fetch = false, convert = true) {
		const d = await db.get("guilds", { id: id })
		if (d) {
			if (convert) return guildManager.parse(d) // fetching all members, channels and userdata took too long so the Guild#channels and Guild#members Maps will be empty
			else return d
		} else {
			if (fetch) {
				const fetched = await guildManager.fetch(id)
				if (fetched) {
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
		if (d) db.upsert("guilds", { id: d.id, name: d.name, icon: d.icon, member_count: d.member_count || 2, owner_id: d.owner_id, permissions: d.permissions || 0, region: d.region, added_by: config.cluster_id })
		return d || null
	},
	parse: function(guild) {
		return new Discord.Guild(guild, client)
	},
	/**
	 * @param {string} id
	 */
	getOverridesFor: async function(id) {
		const value = { allow: BigInt(0x00000000), deny: BigInt(0x00000000) }
		const guild = await guildManager.get(id, true, false)
		if (guild) {
			// @ts-ignore
			value.allow |= (guild.permissions ? BigInt(guild.permissions) : BigInt(0))
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

	const deconstructed = Discord.SnowflakeUtil.deconstruct(id)
	if (!deconstructed || !deconstructed.timestamp) return false
	const date = new Date(deconstructed.timestamp)
	if (date.getTime() > Date.now()) return false
	return true
}

module.exports.cacheManager = { validate, users: userManager, channels: channelManager, members: memberManager, guilds: guildManager, process: processData }
