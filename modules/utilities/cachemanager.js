// @ts-check

const Discord = require("thunderstorm")

const passthrough = require("../../passthrough")
const { client, config, constants } = passthrough

const { contentify, createMessageCollector } = require("./discordutils")
const sql = require("./sql")
const { db } = require("./orm")

function upsertChannel(channel, guild_id) {
	db.upsert("channels", { id: channel.id, type: channel.type, guild_id: guild_id, name: channel.name, rtc_region: channel.rtc_region || null })

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
	if (!user.username || !user.discriminator || user.id) return
	else db.upsert("users", { id: user.id, tag: `${user.username}#${user.discriminator}`, avatar: user.avatar || null, bot: user.bot ? 1 : 0, added_by: config.cluster_id })
}

/**
 * @param {import("thunderstorm/src/internal").InboundDataType} data
 */
function processData(data) {
	const empty = []
	switch (data.t) {
	case "GUILD_CREATE":
	case "GUILD_UPDATE": {
		db.upsert("guilds", { id: data.d.id, name: data.d.name, icon: data.d.icon, member_count: data.d.member_count || 2, owner_id: data.d.owner_id, added_by: config.cluster_id })

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
		if (!data.d.unavailable) {
			guildManager.delete(data.d.id, true)
		}
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
		db.delete("channels", { id: data.d.id })
		db.delete("channel_overrides", { channel_id: data.d.id })
		db.delete("voice_states", { channel_id: data.d.id })
		break
	}
	case "GUILD_MEMBER_ADD":
	case "GUILD_MEMBER_UPDATE": {
		upsertMember(data.d, data.d.guild_id)
		break
	}
	case "GUILD_MEMBER_DELETE": {
		const pl = { guild_id: data.d.guild_id, id: data.d.user.id }
		db.delete("members", pl)
		db.delete("member_roles", pl)
		db.delete("channel_overrides", pl)
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
		if (d && d.id && d.guild_id) db.upsert("channels", { id: d.id, type: d.type, guild_id: d.guild_id, name: d.name, rtc_region: d.rtc_region })
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
			if (message.channel.type === "dm") return res(null)
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
		else if (type == 13) return new Discord.StageChannel(channel, client)
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
			else if (chan.type === 13) return "stage"
			else return "text"
		} else return "text"
	},
	/**
	 * @param {{ id: string }} channel
	 */
	getOverridesFor: async function(channel) {
		const perms = await db.select("channel_overrides", { channel_id: channel.id })
		// @ts-ignore
		const permissions = new Discord.Collection(perms.map(i => [i.id, new Discord.PermissionOverwrites(channel, i)]))
		return permissions
	},
	/**
	 * @param {{ id: string, guild_id: string }} channel
	 * @param {import("thunderstorm").PermissionResolvable} permission
	 * @param {Discord.Collection<string, Discord.PermissionOverwrites>} [overrides]
	 */
	clientHasPermission: async function(channel, permission, overrides) {
		if (!channel.guild_id) return true
		if (!overrides) overrides = await channelManager.getOverridesFor(channel)

		const rolePermissions = await memberManager.rolePermissions(client.user.id, channel.guild_id)
		const roles = rolePermissions.keyArray()
		if (roles.find(item => overrides.get(item) && overrides.get(item).allow.has(permission))) return true
		else if (roles.find(item => overrides.get(item) && overrides.get(item).deny.has(permission))) return false
		else return true
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
		if (d && d.id && d.username && d.discriminator) db.upsert("users", { id: d.id, tag: `${d.username}#${d.discriminator}`, avatar: d.avatar || null, bot: d.bot ? 1 : 0, added_by: config.cluster_id })
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
		const roles = await db.select("member_roles", { id: id, guild_id: guildID }).then(rows => rows.map(r => r.id))
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
	 * @returns {Promise<Discord.Collection<string, Discord.Permissions>>}
	 */
	rolePermissions: async function(userID, guildID) {
		const roledata = await sql.all("SELECT roles.permissions, roles.id FROM roles INNER JOIN member_roles ON roles.id = member_roles.role_id WHERE member_roles.id = $1 AND member_roles.guild_id = $2", [userID, guildID])
		return new Discord.Collection(roledata.map(row => [row.id, new Discord.Permissions(row.permissions)]))
	},
	/**
	 * @param {string} userID
	 * @param {string} guildID
	 * @param {import("thunderstorm").PermissionResolvable} permission
	 * @param {Discord.Collection<string, Discord.Permissions>} [permissions]
	 */
	hasPermission: async function(userID, guildID, permission, permissions) {
		if (!guildID) return true
		if (!permissions) permissions = await memberManager.rolePermissions(userID, guildID)

		/** @type {Discord.Guild} */
		// @ts-ignore
		const g = await guildManager.get(guildID, true, true)
		if (g.ownerID === userID) return true

		return permissions.find(i => i.has(permission, true)) ? true : false
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
		if (d) db.upsert("guilds", { id: d.id, name: d.name, icon: d.icon, member_count: d.member_count || 2, owner_id: d.owner_id, permissions: d.permissions || 0, added_by: config.cluster_id })
		return d || null
	},
	parse: function(guild) {
		return new Discord.Guild(guild, client)
	},
	async delete(id, includeMembers = false) {
		if (!id) {
			const guilds = await db.select("guilds", { added_by: config.cluster_id }, { select: ["id"] }).then(d => d.map(r => r.id))
			for (const guild of guilds) {
				await guildManager.delete(guild)
			}
			return
		}

		const pl1 = { id: id }
		const pl2 = { guild_id: id }

		const promises = [
			db.delete("guilds", pl1),
			db.delete("channels", pl2),
			db.delete("channel_overrides", pl2),
			db.delete("roles", pl2),
			db.delete("voice_states", pl2)
		]

		if (includeMembers) {
			promises.push(
				db.delete("members", pl2),
				db.delete("member_roles", pl2)
			)
		}

		void await Promise.all(promises)
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
