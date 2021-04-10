const Discord = require("thunderstorm")
const Jimp = require("jimp")

const passthrough = require("../passthrough")
const { constants, client, commands, reloader } = passthrough

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

const emojis = require("../emojis")

commands.assign([
	{
		usage: "[User]",
		description: "Get couple information about a user",
		aliases: ["couple"],
		category: "couples",
		examples: ["couple PapiOphidian"],
		async process(msg, suffix, lang) {
			let user, member
			if (msg.channel.type !== "dm") {
				member = await utils.cacheManager.members.find(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix, true)
			if (!user) return msg.channel.send(`${msg.author.username}, that is not a valid user.`)
			const info = await utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", user.id)
			if (!info) return msg.channel.send("No couple info.")
			/** @type {Discord.User} */
			let user1
			/** @type {Discord.User} */
			let user2
			if (info.user1 === msg.author.id) user1 = msg.author
			else if (info.user2 === msg.author.id) user2 = msg.author
			if (!user1 && !user2) {
				// @ts-ignore
				[user1, user2] = await Promise.all([
					utils.cacheManager.users.get(info.user1, true, true),
					utils.cacheManager.users.get(info.user2, true, true)
				])
				// @ts-ignore
			} else if (!user1) user1 = await utils.cacheManager.users.get(info.user1, true, true)
			// @ts-ignore
			else if (!user2) user2 = await utils.cacheManager.users.get(info.user2, true, true)
			const marriedAt = new Date(info.married_at)
			const embed = new Discord.MessageEmbed()
				.setAuthor(`Couple info for ${user1.tag} and ${user2.tag}`)
				.addFields([
					{
						name: "Users",
						value: `${user1.tag} (${user1.id})\n${user2.tag} (${user2.id})`
					},
					{
						name: "Balance",
						value: utils.numberComma(Number(info.balance))
					},
					{
						name: "Married for",
						value: utils.shortTime((Date.now() - marriedAt.getTime()), "ms")
					}
				])
				.setColor(constants.standard_embed_color)
			return msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	},
	{
		usage: "<User>",
		description: "Propose to a user",
		aliases: ["marry", "propose"],
		category: "couples",
		examples: ["marry PapiOphidian"],
		async process(msg, suffix, lang) {
			if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to propose to.`)
			let user, member
			if (msg.channel.type !== "dm") {
				member = await utils.cacheManager.members.find(msg, suffix)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix)
			if (!user) return msg.channel.send(`${msg.author.tag}, that is not a valid user.`)
			const [authorrel, userrel, proposed, memsettings, guildsettings] = await Promise.all([
				utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", msg.author.id),
				utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", user.id),
				utils.sql.get("SELECT * FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [msg.author.id, user.id]),
				utils.sql.get("SELECT * FROM settings_self WHERE key_id = $1 AND setting = $2", [user.id, "waifualert"]),
				msg.guild ? utils.sql.get("SELECT * FROM settings_guild WHERE key_id = $1 AND setting = $2", [msg.guild.id, "waifualert"]) : Promise.resolve(null)
			])
			if (authorrel) return msg.channel.send(`${msg.author.username}, you are already married.`)
			if (userrel) return msg.channel.send(`${msg.author.username}, ${user.username} is already married.`)
			if (proposed) return msg.channel.send(`${msg.author.username}, you're already proposed to ${user.tag}.`)
			await utils.sql.all("INSERT INTO pending_relations (user1, user2) VALUES ($1, $2)", [msg.author.id, user.id])
			msg.channel.send(`${msg.author.username} has succesfully proposed to ${user.tag}. They can use \`&accept ${msg.author.tag}\` or \`&decline ${msg.author.tag}\` to marry or decline`)
			if (memsettings && memsettings.value == 0) return
			if (guildsettings && guildsettings.value == 0) {
				if (memsettings && memsettings.value == 1) return user.send(`${msg.author.tag} has proposed to you. You can use \`&accept ${msg.author.tag}\` or \`&decline ${msg.author.tag}\` to marry or decline ${msg.author.tag}`).catch(() => msg.channel.send("I couldn't DM that user"))
				else return
			}
			return user.send(`${msg.author.tag} has proposed to you. You can use \`&accept ${msg.author.tag}\` or \`&decline ${msg.author.tag}\` to marry or decline ${msg.author.tag}`).catch(() => msg.channel.send("I couldn't DM that user"))
		}
	},
	{
		usage: "<User>",
		description: "Accepts a proposal from a user",
		aliases: ["accept", "acceptmarriage", "acceptproposal"],
		category: "couples",
		examples: ["accept PapiOphidian"],
		async process(msg, suffix, lang) {
			if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to propose to.`)
			let user, member
			if (msg.channel.type !== "dm") {
				member = await utils.cacheManager.members.find(msg, suffix)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix)
			if (!user) return msg.channel.send(`${msg.author.tag}, that is not a valid user.`)
			const [authorrel, userrel, pending] = await Promise.all([
				utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", msg.author.id),
				utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", user.id),
				utils.sql.get("SELECT * FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [msg.author.id, user.id])
			])
			if (!pending) return msg.channel.send(`${msg.author.username}, ${user.tag} has not proposed to you yet.`)
			if (pending.user1 === msg.author.id) return msg.channel.send(`${msg.author.username}, you cannot accept your own proposal.`)
			let del = false
			if (authorrel) {
				del = true
				msg.channel.send(`${msg.author.username}, you are already married to someone.`)
			}
			if (userrel) {
				del = true
				msg.channel.send(`${msg.author.username}, ${user.username} is already married to someone.`)
			}
			if (del) {
				return utils.sql.all("DELETE FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [msg.author.id, user.id])
			}
			await Promise.all([
				utils.sql.all("DELETE FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [msg.author.id, user.id]),
				utils.sql.all("INSERT INTO couples (user1, user2) VALUES ($1, $2)", [msg.author.id, user.id])
			])
			return msg.channel.send(`${msg.author.username} is now married to ${user.tag}.`)
		}
	},
	{
		usage: "<User>",
		description: "Declines a proposal from a user",
		aliases: ["decline", "declinemarriage", "declineproposal"],
		category: "couples",
		examples: ["decline PapiOphidian"],
		async process(msg, suffix, lang) {
			if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to decline.`)
			let user, member
			if (msg.channel.type !== "dm") {
				member = await utils.cacheManager.members.find(msg, suffix)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix)
			if (!user) return msg.channel.send(`${msg.author.tag}, that is not a valid user.`)
			const [authorrel, userrel, pending] = await Promise.all([
				utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", msg.author.id),
				utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", user.id),
				utils.sql.get("SELECT * FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [msg.author.id, user.id])
			])
			if (!pending) return msg.channel.send(`${msg.author.username}, ${user.tag} has not proposed to you yet.`)
			if (pending.user1 === msg.author.id) return msg.channel.send(`${msg.author.username}, you cannot decline your own proposal.`)
			let del = false
			if (authorrel) {
				del = true
				msg.channel.send(`${msg.author.username}, you are already married.`)
			}
			if (userrel) {
				del = true
				msg.channel.send(`${msg.author.username}, ${user.username} is already married.`)
			}
			if (del) {
				return utils.sql.all("DELETE FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [msg.author.id, user.id])
			}
			await Promise.all([
				utils.sql.all("DELETE FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [msg.author.id, user.id]),
				utils.sql.all("DELETE FROM couples WHERE user1 = $1 OR user2 = $2", [msg.author.id, user.id])
			])
			return msg.channel.send(`${msg.author.username} has declined ${user.tag}'s marriage proposal.`)
		}
	},
	{
		usage: "[reason]",
		description: "Divorces a user",
		aliases: ["divorce"],
		category: "couples",
		examples: ["divorce I'm sorry"],
		async process(msg, suffix, lang) {
			const married = await utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", msg.author.id)
			if (!married) return msg.channel.send(`${msg.author.username}, you are not married to anyone`)
			const otherid = married.user1 === msg.author.id ? married.user2 : married.user1
			/** @type {Discord.User} */
			// @ts-ignore
			const partner = await utils.cacheManager.users.get(otherid, true, true)
			const faces = ["( ≧Д≦)", "●︿●", "(  ❛︵❛.)", "╥﹏╥", "(っ◞‸◟c)"]
			const face = utils.arrayRandom(faces)
			await Promise.all([
				utils.sql.all("DELETE FROM couples WHERE user1 = $1 OR user2 = $1", msg.author.id),
				Number(married.balance || 0) ? utils.coinsManager.award(otherid, Number(married.balance)) : Promise.resolve(null)
			])
			msg.channel.send(utils.replace(lang.couples.divorce.returns.divorced, { "tag1": msg.author.tag, "tag2": partner.tag, "reason": suffix ? `reason: ${suffix}` : "no reason specified" }))
			const memsettings = await utils.sql.get("SELECT * FROM settings_self WHERE key_id = $1 AND setting = $2", [otherid, "waifualert"])
			let guildsettings
			const memlang = await utils.getLang(otherid, "self")
			if (msg.guild) guildsettings = await utils.sql.get("SELECT * FROM settings_guild WHERE key_id = $1 AND setting = $2", [msg.guild.id, "waifualert"])
			if (memsettings && memsettings.value == 0) return
			if (guildsettings && guildsettings.value == 0) {
				if (memsettings && memsettings.value == 1) return partner.send(`${utils.replace(memlang.couples.divorce.returns.dm, { "tag": msg.author.tag, "reason": suffix ? `reason: ${suffix}` : "no reason specified" })} ${face}`).catch(() => msg.channel.send(lang.couples.divorce.prompts.dmFailed))
				else return
			}
			return partner.send(`${utils.replace(memlang.couples.divorce.returns.dm, { "tag": msg.author.tag, "reason": suffix ? `reason: ${suffix}` : "no reason specified" })} ${face}`).catch(() => msg.channel.send(lang.couples.divorce.prompts.dmFailed))
		}
	},
	{
		usage: "[User]",
		description: "View the balance of a couple",
		aliases: ["bank", "couplebalance", "couplebal", "cbalance", "cbal"],
		category: "couples",
		examples: ["cbal PapiOphidian"],
		async process(msg, suffix, lang) {
			let user, member
			if (msg.channel.type !== "dm") {
				member = await utils.cacheManager.members.find(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix, true)
			if (!user) return msg.channel.send(`${msg.author.tag}, that is not a valid user.`)
			const row = await utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", user.id)
			if (!row) {
				if (user.id === msg.author.id) return msg.channel.send(`${msg.author.username}, you are not married to anyone.`)
				else return msg.channel.send(`${msg.author.username}, that person is not married to anyone.`)
			}
			/** @type {Discord.User} */
			let user1
			/** @type {Discord.User} */
			let user2
			if (row.user1 === msg.author.id) user1 = msg.author
			else if (row.user2 === msg.author.id) user2 = msg.author
			if (!user1 && !user2) {
				// @ts-ignore
				[user1, user2] = await Promise.all([
					utils.cacheManager.users.get(row.user1, true, true),
					utils.cacheManager.users.get(row.user2, true, true)
				])
				// @ts-ignore
			} else if (!user1) user1 = await utils.cacheManager.users.get(row.user1, true, true)
			// @ts-ignore
			else if (!user2) user2 = await utils.cacheManager.users.get(row.user2, true, true)

			const embed = new Discord.MessageEmbed()
				.setAuthor(`Couple balance for ${user1.tag} and ${user2.tag}`)
				.setDescription(`${utils.numberComma(Number(row.balance))} ${emojis.discoin}`)
				.setColor(constants.money_embed_color)
			return msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	},
	{
		usage: "<amount: number|all|half>",
		description: "Withdraw money from your couple balance",
		aliases: ["withdraw"],
		category: "couples",
		examples: ["withdraw 69"],
		async process(msg, suffix, lang) {
			const row = await utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", msg.author.id)
			if (!row) return msg.channel.send(`${msg.author.username}, you are not married to anyone.`)
			if (Number(row.balance) === 0) return msg.channel.send(`${msg.author.username}, there is no money to withdraw.`)
			let amount
			if (suffix == "all" || suffix == "half") {
				if (suffix == "all") {
					amount = Number(row.balance)
				} else {
					amount = Math.floor(Number(row.balance) / 2)
				}
			} else {
				const num = utils.parseNumber(suffix)
				if (isNaN(num)) return msg.channel.send(`${msg.author.username}, that is not a valid amount.`)
				if (num <= 0) return msg.channel.send(`${msg.author.username}, you must provide a number greater than 0.`)
				amount = num
			}
			if (amount > Number(row.balance)) return msg.channel.send(`${msg.author.username}, you cannot withdraw more than what is in the couple balance.`)
			await Promise.all([
				utils.sql.all("UPDATE couples SET balance = $1, married_at = $2 WHERE (user1 = $3 OR user2 = $3)", [Number(row.balance) - amount, row.married_at, msg.author.id]),
				utils.coinsManager.award(msg.author.id, amount)
			])
			return msg.channel.send(`${msg.author.username}, successfully transacted ${utils.numberComma(amount)} to your balance.`)
		}
	},
	{
		usage: "<amount: number|all|half>",
		description: "Deposit money to your couple balance",
		aliases: ["deposit"],
		category: "couples",
		examples: ["deposit 5000"],
		async process(msg, suffix, lang) {
			const [row, money] = await Promise.all([
				utils.sql.get("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", msg.author.id),
				utils.coinsManager.get(msg.author.id)
			])
			if (!row) return msg.channel.send(`${msg.author.username}, you are not married to anyone.`)
			let amount
			if (suffix == "all" || suffix == "half") {
				if (money == 0) return msg.channel.send(`${msg.author.username}, you don't have any amandollars to deposit`)
				if (suffix == "all") {
					amount = money
				} else {
					amount = Math.floor(money / 2)
				}
			} else {
				const num = utils.parseNumber(suffix)
				if (isNaN(num)) return msg.channel.send(`${msg.author.username}, that is not a valid amount.`)
				if (num <= 0) return msg.channel.send(`${msg.author.username}, you must provide a number greater than 0.`)
				if (num > money) return msg.channel.send(`${msg.author.username}, you do not have that many amandollars`)
				amount = num
			}
			await Promise.all([
				utils.sql.all("UPDATE couples SET balance = $1, married_at = $2 WHERE (user1 = $3 OR user2 = $3)", [Number(row.balance) + amount, row.married_at, msg.author.id]),
				utils.coinsManager.award(msg.author.id, -amount)
			])
			return msg.channel.send(`${msg.author.username}, successfully transacted ${utils.numberComma(amount)} from your balance.`)
		}
	},
	{
		usage: "[local] [page: number]",
		description: "Displays the leaderboard of the richest couples",
		aliases: ["coupleleaderboard", "couplelb"],
		category: "couples",
		examples: ["couplelb 2"],
		async process(msg, suffix, lang) {
			const maxPages = 20
			const itemsPerPage = 10

			const args = suffix.split(" ")

			// Set up local
			const isLocal = ["local", "guild", "server"].includes(args[0])
			if (isLocal) {
				args.shift() // if it exists, page number will now definitely be in args[0]
				if (msg.channel.type === "dm") return msg.channel.send(utils.replace(lang.gambling.coins.prompts.guildOnly, { "username": msg.author.username }))
			}

			// Set up page number
			let pageNumber = +args[0]
			if (!isNaN(pageNumber)) {
				pageNumber = Math.max(Math.floor(pageNumber), 1)
			} else {
				pageNumber = 1
			}

			if (pageNumber > maxPages) {
				return msg.channel.send(utils.replace(lang.gambling.leaderboard.prompts.pageLimit, { "username": msg.author.username, "maxPages": maxPages }))
			}

			// Get all the rows
			let rows = null
			let availableRowCount = null
			const offset = (pageNumber - 1) * itemsPerPage
			if (isLocal) {
				rows = await utils.sql.all(`SELECT couples.user1, couples.user2, couples.balance FROM couples INNER JOIN members ON (couples.user1 = members.id OR couples.user2 = members.id) WHERE members.guild_id = $1 ORDER BY balance DESC LIMIT ${itemsPerPage} OFFSET ${offset}`, msg.guild.id)
				availableRowCount = rows.length
			} else {
				rows = await utils.sql.all("SELECT * FROM couples ORDER BY balance DESC LIMIT $1 OFFSET $2", [itemsPerPage, offset])
				availableRowCount = (await utils.sql.get("SELECT count(*) AS count FROM couples")).count
			}

			const lastAvailablePage = Math.min(Math.ceil(availableRowCount / itemsPerPage), maxPages)
			const title = isLocal ? "Local Couple Leaderboard" : "Couple Leaderboard"
			const footerHelp = `&coupleleaderboard ${lang.couples.coupleleaderboard.help.usage}`

			if (rows.length) {
				const usersToResolve = new Set()
				const userTagMap = new Map()
				for (const row of rows) {
					usersToResolve.add(row.user1)
					usersToResolve.add(row.user2)
				}
				await Promise.all([...usersToResolve].map(userID =>
					utils.cacheManager.users.get(userID, true, true)
						// @ts-ignore
						.then(user => user.tag)
						.catch(() => userID) // fall back to userID if user no longer exists
						.then(display => userTagMap.set(userID, display))
				))
				const displayRows = rows.map((row, index) => {
					const ranking = itemsPerPage * (pageNumber - 1) + index + 1
					return `${ranking}. ${userTagMap.get(row.user1)} & ${userTagMap.get(row.user2)} :: ${utils.numberComma(Number(row.balance))} ${emojis.discoin}`
				})
				const embed = new Discord.MessageEmbed()
					.setTitle(title)
					.setDescription(displayRows.join("\n"))
					.setFooter(utils.replace(lang.couples.coupleleaderboard.returns.pageCurrent, { "current": pageNumber, "total": lastAvailablePage }) + ` | ${footerHelp}`) // SC: U+2002 EN SPACE
					.setColor(constants.money_embed_color)
				return msg.channel.send(await utils.contentify(msg.channel, embed))
			} else msg.channel.send(utils.replace(lang.gambling.leaderboard.prompts.pageLimit, { "username": msg.author.username, "maxPages": lastAvailablePage }))
		}
	}
])
