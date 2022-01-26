import Discord from "thunderstorm"

import passthrough from "../passthrough"
const { constants, commands, sync } = passthrough

const emojis = sync.require("../emojis") as typeof import("../emojis")
const orm = sync.require("../utils/orm") as typeof import("../utils/orm")
const discordUtils = sync.require("../utils/discord") as typeof import("../utils/discord")
const text = sync.require("../utils/string") as typeof import("../utils/string")
const language = sync.require("../utils/language") as typeof import("../utils/language")

commands.assign([
	{
		name: "couple",
		description: "Get couple information about a user",
		category: "couples",
		options: [
			{
				name: "user",
				type: Discord.Constants.ApplicationCommandOptionTypes.USER,
				description: "The user you want to check couple info for",
				required: false
			}
		],
		async process(cmd, lang) {
			await cmd.defer()
			const user1 = cmd.options.getUser("user", false) || cmd.user
			const info = await orm.db.raw("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [user1.id]).then(d => d[0])
			if (!info) return cmd.editReply(lang.couples.couple.prompts.noInfo)
			const user2 = await discordUtils.getUser(info.user1 === user1.id ? info.user2 as string : info.user1 as string)
			if (!user2) return cmd.editReply("There was an error getting the other user in the couple")
			const embed = new Discord.MessageEmbed()
				.setAuthor(`Couple info for ${user1.tag} & ${user2.tag}`)
				.addFields([
					{
						name: "Users",
						value: `${[user1, user2].map(u => `${u.tag} (${u.id})`).join("\n")}`
					},
					{
						name: "Balance",
						value: text.numberComma(info.balance as string)
					}
				])
				.setColor(constants.standard_embed_color)
			return cmd.editReply({ embeds: [embed] })
		}
	},
	{
		name: "marry",
		description: "Propose to a user",
		category: "couples",
		options: [
			{
				name: "user",
				type: Discord.Constants.ApplicationCommandOptionTypes.USER,
				description: "The user to propose to",
				required: true
			}
		],
		async process(cmd, lang) {
			const user = cmd.options.getUser("user", true)!
			await cmd.defer()
			if (user.id === cmd.user.id) return cmd.editReply("You can't marry yourself")
			const [authorrel, userrel, proposed, memsettings, guildsettings] = await Promise.all([
				orm.db.raw("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [cmd.user.id]).then(d => d[0]),
				orm.db.raw("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [user.id]).then(d => d[0]),
				orm.db.get("pending_relations", { user1: cmd.user.id, user2: user.id }),
				orm.db.get("settings_self", { key_id: user.id, value: "waifualert" }),
				cmd.guildId ? orm.db.get("settings_guild", { key_id: cmd.guildId, value: "waifualert" }) : Promise.resolve(null)
			])
			if (authorrel) return cmd.editReply(language.replace(lang.couples.marry.prompts.selfMarried, { username: cmd.user.username }))
			if (userrel) return cmd.editReply(`${cmd.user.username}, ${user.username} is already married.`)
			if (proposed) return cmd.editReply(language.replace(lang.couples.marry.prompts.selfProposed, { username: cmd.user.username, tag: user.tag }))
			await orm.db.insert("pending_relations", { user1: cmd.user.id, user2: user.id })
			cmd.editReply(language.replace(lang.couples.marry.returns.proposed, { username: cmd.user.username, tag: user.tag, accept: `\`/accept user:${cmd.user.tag}\``, decline: `\`/decline user:${cmd.user.tag}\`` }))
			if (memsettings && Number(memsettings.value) === 0) return
			if (guildsettings && Number(guildsettings.value) == 0) {
				if (memsettings && Number(memsettings.value) == 1) {
					return user.send(language.replace(lang.couples.marry.returns.dmProposed, { tag: cmd.user.tag, accept: `\`/accept user:${cmd.user.tag}\``, decline: `\`/decline user:${cmd.user.tag}\`` }))
						.catch(() => cmd.followUp(lang.couples.marry.prompts.dmFailed))
				} else return
			}
			return user.send(language.replace(lang.couples.marry.returns.dmProposed, { tag: cmd.user.tag, accept: `\`/accept user:${cmd.user.tag}\``, decline: `\`/decline user:${cmd.user.tag}\`` }))
				.catch(() => cmd.followUp(lang.couples.marry.prompts.dmFailed))
		}
	},
	{
		name: "accept",
		description: "Accepts a proposal from a user",
		category: "couples",
		options: [
			{
				name: "user",
				type: Discord.Constants.ApplicationCommandOptionTypes.USER,
				description: "The user to accept the proposal from",
				required: true
			}
		],
		async process(cmd, lang) {
			const user = cmd.options.getUser("user", true)!
			await cmd.defer()
			const [authorrel, userrel, pending] = await Promise.all([
				orm.db.raw("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [cmd.user.id]).then(d => d[0]),
				orm.db.raw("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [user.id]).then(d => d[0]),
				orm.db.get("pending_relations", { user1: user.id, user2: cmd.user.id })
			])
			if (!pending) return cmd.editReply(language.replace(lang.couples.accept.prompts.noProposal, { username: cmd.user.username, tag: user.tag }))
			if (pending.user1 === cmd.user.id) return cmd.editReply(language.replace(lang.couples.accept.prompts.selfProposed, { username: cmd.user.username }))
			let del = false
			if (authorrel) {
				del = true
				cmd.editReply(language.replace(lang.couples.accept.prompts.selfMarried, { username: cmd.user.username }))
			}
			if (userrel) {
				del = true
				cmd.editReply(language.replace(lang.couples.accept.prompts.userMarried, { username: cmd.user.username, user: user.tag }))
			}
			orm.db.delete("pending_relations", { user1: user.id, user2: cmd.user.id })
			if (del) return

			await orm.db.insert("couples", { user1: cmd.user.id, user2: user.id })

			const bank = await orm.db.raw("INSERT INTO bank_accounts (type) VALUES ($1) RETURNING id", [1]).then(d => d[0])
			if (!bank || !bank.id) throw new Error("USER_MARRIED_NO_BANK_CREATED_FUCK_FUCK_FUCK")
			await orm.db.raw("INSERT INTO bank_access (id, user_id) VALUES ($1, $2), ($1, $3)", [bank.id, cmd.user.id, user.id])
			return cmd.editReply(language.replace(lang.couples.accept.returns.married, { tag1: cmd.user.tag, tag2: user.tag }))
		}
	},
	{
		name: "decilne",
		description: "Declines a proposal from a user",
		category: "couples",
		options: [
			{
				name: "user",
				type: Discord.Constants.ApplicationCommandOptionTypes.USER,
				description: "The user to decline the proposal from",
				required: true
			}
		],
		async process(cmd, lang) {
			const user = cmd.options.getUser("user", true)!
			await cmd.defer()
			const [authorrel, userrel, pending] = await Promise.all([
				orm.db.raw("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [cmd.user.id]).then(d => d[0]),
				orm.db.raw("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [user.id]).then(d => d[0]),
				orm.db.get("pending_relations", { user1: user.id, user2: cmd.user.id })
			])
			if (!pending) return cmd.editReply(language.replace(lang.couples.decline.prompts.noProposal, { username: cmd.user.username, tag: user.tag }))
			if (pending.user1 === cmd.user.id) return cmd.editReply(language.replace(lang.couples.decline.prompts.selfProposed, { username: cmd.user.username }))
			let del = false
			if (authorrel) {
				del = true
				cmd.editReply(language.replace(lang.couples.decline.prompts.selfMarried, { username: cmd.user.username }))
			}
			if (userrel) {
				del = true
				cmd.editReply(language.replace(lang.couples.decline.prompts.userMarried, { username: cmd.user.username, user: user.tag }))
			}
			orm.db.delete("pending_relations", { user1: user.id, user2: cmd.user.id })
			if (del) return
			return cmd.editReply(language.replace(lang.couples.decline.returns.declines, { tag1: cmd.user.tag, tag2: user.tag }))
		}
	}/* ,
	{
		name: "divorce",
		description: "Divorces a user",
		category: "couples",
		options: [
			{
				name: "reason",
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
				description: "The reason for divorce",
				required: false
			}
		],
		async process(cmd, lang) {
			const married = await utils.coinsManager.getCoupleRow(msg.author.id)
			if (!married) return msg.channel.send(`${msg.author.username}, you are not married to anyone`)
			const otherid = married.users.find(id => id !== msg.author.id)
			const partner = await utils.cacheManager.users.get(otherid, true, true)
			const faces = ["( ≧Д≦)", "●︿●", "(  ❛︵❛.)", "╥﹏╥", "(っ◞‸◟c)"]
			const face = utils.arrayRandom(faces)
			await Promise.all([
				utils.sql.all("DELETE FROM couples WHERE user1 = $1 OR user2 = $1", msg.author.id),
				utils.orm.db.delete("bank_accounts", { id: married.id }),
				utils.orm.db.delete("bank_access", { id: married.id }),
				Number(married.amount || 0) ? utils.coinsManager.award(otherid, BigInt(married.amount), "Divorce inheritance") : Promise.resolve(null)
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
		process(msg, suffix, lang, prefixes) {
			return commands.cache.get("coins").process(msg, suffix + " --couple", lang, prefixes)
		}
	},
	{
		usage: "<amount: number|all|half>",
		description: "Withdraw money from your couple balance",
		aliases: ["withdraw"],
		category: "couples",
		examples: ["withdraw 69"],
		async process(msg, suffix, lang) {
			const row = await utils.coinsManager.getCoupleRow(msg.author.id)
			if (!row) return msg.channel.send(`${msg.author.username}, you are not married to anyone.`)
			if (BigInt(row.amount) === BigInt(0)) return msg.channel.send(`${msg.author.username}, there is no money to withdraw.`)
			let amount
			if (suffix == "all" || suffix == "half") {
				if (suffix == "all") {
					amount = BigInt(row.amount)
				} else {
					amount = BigInt(row.amount) / BigInt(2)
				}
			} else {
				const num = utils.parseBigInt(suffix)
				if (!num) return msg.channel.send(`${msg.author.username}, that is not a valid amount.`)
				if (num <= BigInt(0)) return msg.channel.send(`${msg.author.username}, you must provide a number greater than 0.`)
				amount = num
			}
			if (amount > BigInt(row.amount)) return msg.channel.send(`${msg.author.username}, you cannot withdraw more than what is in the couple balance.`)
			await Promise.all([
				utils.orm.db.update("bank_accounts", { amount: (BigInt(row.amount) - amount).toString() }, { id: row.id }),
				utils.orm.db.insert("transactions", { user_id: msg.author.id, amount: amount.toString(), mode: 1, description: `Withdrawl by ${msg.author.id}`, target: row.id }),
				utils.coinsManager.award(msg.author.id, amount, "Withdrawl from shared account")
			]).catch(console.error)
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
				utils.coinsManager.getCoupleRow(msg.author.id),
				utils.coinsManager.get(msg.author.id)
			])
			if (!row) return msg.channel.send(`${msg.author.username}, you are not married to anyone.`)
			let amount
			if (suffix == "all" || suffix == "half") {
				if (money === BigInt(0)) return msg.channel.send(`${msg.author.username}, you don't have any amandollars to deposit`)
				if (suffix == "all") {
					amount = money
				} else {
					amount = money / BigInt(2)
				}
			} else {
				const num = utils.parseBigInt(suffix)
				if (!num) return msg.channel.send(`${msg.author.username}, that is not a valid amount.`)
				if (num <= BigInt(0)) return msg.channel.send(`${msg.author.username}, you must provide a number greater than 0.`)
				if (num > money) return msg.channel.send(`${msg.author.username}, you do not have that many amandollars`)
				amount = num
			}
			await Promise.all([
				utils.orm.db.update("bank_accounts", { amount: (BigInt(row.amount) + amount).toString() }, { id: row.id }),
				utils.orm.db.insert("transactions", { user_id: msg.author.id, amount: amount.toString(), mode: 0, description: `Deposit by ${msg.author.id}`, target: row.id }),
				utils.coinsManager.award(msg.author.id, amount * BigInt(-1), "Deposit to shared account")
			]).catch(console.error)
			return msg.channel.send(`${msg.author.username}, successfully transacted ${utils.numberComma(amount)} from your balance.`)
		}
	},
	{
		usage: "[local] [page: number]",
		description: "Displays the leaderboard of the richest couples",
		aliases: ["coupleleaderboard", "couplelb"],
		category: "couples",
		examples: ["couplelb 2"],
		async process(msg, suffix, lang, prefixes) {
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
				rows = await utils.sql.all(`SELECT bank_accounts.id, bank_accounts.amount FROM (SELECT DISTINCT ON (bank_access.id) bank_access.id FROM bank_access INNER JOIN members ON bank_access.user_id = members.id WHERE members.guild_id = $1) temp INNER JOIN bank_accounts ON bank_accounts.id = temp.id WHERE bank_accounts.type = 1 ORDER BY bank_accounts.amount DESC LIMIT ${maxPages * itemsPerPage}`, msg.guild.id)
				availableRowCount = rows.length
			} else {
				rows = await utils.sql.all(`SELECT bank_accounts.id, bank_accounts.amount FROM (SELECT DISTINCT ON (bank_access.id) bank_access.id FROM bank_access) temp INNER JOIN bank_accounts ON bank_accounts.id = temp.id WHERE bank_accounts.type = 1 ORDER BY bank_accounts.amount DESC LIMIT ${itemsPerPage} OFFSET ${offset}`)
				availableRowCount = (await utils.sql.get("SELECT COUNT(*) AS count FROM bank_accounts WHERE type = 1")).count
			}

			const lastAvailablePage = Math.min(Math.ceil(availableRowCount / itemsPerPage), maxPages)
			const title = isLocal ? "Local Couple Leaderboard" : "Couple Leaderboard"
			const footerHelp = `${prefixes.main}coupleleaderboard ${lang.couples.coupleleaderboard.help.usage}`

			if (rows.length) {
				const usersToResolve = new Set<string>()
				const userTagMap = new Map<string, string>()
				const usersMap = new Map<string, Array<string>>()
				for (const row of rows) {
					const users = await utils.orm.db.select("bank_access", { id: row.id }, { select: ["user_id"] }).then(rs => rs.map(r => r.user_id))
					users.forEach(u => usersToResolve.add(u))
					usersMap.set(row.id, users)
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
					const users = usersMap.get(row.id)
					return `${ranking}. ${users.slice(0, -1).map(u => userTagMap.get(u)).join(", ")} & ${userTagMap.get(users.slice(-1)[0])} :: ${utils.numberComma(row.amount)} ${emojis.discoin}`
				})
				const embed = new Discord.MessageEmbed()
					.setTitle(title)
					.setDescription(displayRows.join("\n"))
					.setFooter(utils.replace(lang.couples.coupleleaderboard.returns.pageCurrent, { "current": pageNumber, "total": lastAvailablePage }) + ` | ${footerHelp}`) // SC: U+2002 EN SPACE
					.setColor(constants.money_embed_color)
				return msg.channel.send(await utils.contentify(msg.channel, embed))
			} else msg.channel.send(utils.replace(lang.gambling.leaderboard.prompts.pageLimit, { "username": msg.author.username, "maxPages": lastAvailablePage }))
		}
	} */
])
