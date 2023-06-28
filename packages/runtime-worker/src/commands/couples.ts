import passthrough = require("../passthrough")
const { commands, sql, confprovider, client, sync } = passthrough

import sharedUtils = require("@amanda/shared-utils")

const moneyManager: typeof import("../money-manager") = sync.require("../money-manager")
const emojis: typeof import("../emojis") = sync.require("../emojis")

commands.assign([
	{
		name: "couple",
		description: "Get couple information about a user",
		category: "couples",
		options: [
			{
				name: "user",
				type: 6,
				description: "The user to get info on",
				required: false
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const user = cmd.data.users.get(cmd.data.options.get("user")?.asString() ?? "") ?? cmd.author
			const info = await moneyManager.getCoupleRow(user.id)

			if (!info) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NONE
				})
			}

			const users = [user, ...(await Promise.all(info.users.filter(u => u !== user.id).map(u => sharedUtils.getUser(u, client.snow, client))))]

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						author: {
							name: `${users.slice(0, -1).map(sharedUtils.userString).join(", ")} & ${sharedUtils.userString(users.slice(-1)[0])}`
						},
						description: `${sharedUtils.numberComma(info.amount)} ${emojis.discoin}`,
						color: confprovider.config.standard_embed_color
					}
				]
			})
		}
	},
	{
		name: "propose",
		description: "Propose to a user",
		category: "couples",
		options: [
			{
				name: "user",
				type: 6,
				description: "The user to propose to",
				required: true
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const user = cmd.data.users.get(cmd.data.options.get("user")!.asString()!)!

			if (user.id === cmd.author.id) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "You can't marry yourself"
				})
			}

			const [authorrel, userrel, proposed] = await Promise.all([
				sql.get<"couples">("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [cmd.author.id]),
				sql.get<"couples">("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [user.id]),
				sql.get<"pending_relations">("SELECT * FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [cmd.author.id, user.id])
			])

			if (authorrel) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "You are already married"
				})
			}

			if (userrel) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `${sharedUtils.userString(user)} is already married`
				})
			}

			if (proposed) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `You have already proposed to ${sharedUtils.userString(user)}`
				})
			}

			await sql.orm.insert("pending_relations", { user1: cmd.author.id, user2: user.id })

			client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: `You have proposed to ${sharedUtils.userString(user)}. They must accept for you two to become married`
			})
		}
	},
	{
		name: "marry",
		description: "Accepts a proposal from a user",
		category: "couples",
		options: [
			{
				name: "user",
				type: 6,
				description: "The user to marry",
				required: true
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const user = cmd.data.users.get(cmd.data.options.get("user")!.asString()!)!

			if (cmd.author.id === user.id) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "You can't marry yourself"
				})
			}

			const [authorrel, userrel, pending] = await Promise.all([
				sql.get<"couples">("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [cmd.author.id]),
				sql.get<"couples">("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [user.id]),
				sql.get<"pending_relations">("SELECT * FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [cmd.author.id, user.id])
			])

			if (!pending) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `${sharedUtils.userString(user)} hasn't propsed to you yet`
				})
			}

			if (pending.user1 === cmd.author.id) {
				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "How did you propose to yourself???"
				})
			}

			let del = false
			if (authorrel) {
				del = true
				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "You are already married"
				})
			}

			if (userrel) {
				del = true
				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `${sharedUtils.userString(user)} is already married`
				})
			}

			if (del) {
				return sql.raw("DELETE FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [cmd.author.id, user.id])
			}

			await Promise.all([
				sql.raw("DELETE FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [cmd.author.id, user.id]),
				sql.raw("INSERT INTO couples (user1, user2) VALUES ($1, $2)", [cmd.author.id, user.id])
			])

			const bank = await sql.get<{ id: number }>("INSERT INTO bank_accounts (type) VALUES ($1) RETURNING id", [1])

			if (!bank?.id) throw new Error("USER_MARRIED_NO_BANK_CREATED_FUCK_FUCK_FUCK")

			await sql.raw("INSERT INTO bank_access (id, user_id) VALUES ($1, $2), ($1, $3)", [bank.id, cmd.author.id, user.id])
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: `${sharedUtils.userString(cmd.author)} is now married to ${sharedUtils.userString(user)}`
			})
		}
	},
	{
		name: "reject",
		description: "Rejects a proposal from a user",
		category: "couples",
		options: [
			{
				name: "user",
				type: 6,
				description: "The user to reject",
				required: true
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const user = cmd.data.users.get(cmd.data.options.get("user")!.asString()!)!

			if (cmd.author.id === user.id) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "You can't marry yourself"
				})
			}

			const [authorrel, userrel, pending] = await Promise.all([
				sql.get<"couples">("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [cmd.author.id]),
				sql.get<"couples">("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [user.id]),
				sql.get<"pending_relations">("SELECT * FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [cmd.author.id, user.id])
			])

			if (!pending) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `${sharedUtils.userString(user)} hasn't propsed to you yet`
				})
			}

			if (pending.user1 === cmd.author.id) {
				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "How did you propose to yourself???"
				})
			}

			let del = false
			if (authorrel) {
				del = true
				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "You are already married"
				})
			}

			if (userrel) {
				del = true
				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `${sharedUtils.userString(user)} is already married`
				})
			}

			if (del) {
				return sql.raw("DELETE FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [cmd.author.id, user.id])
			}

			await Promise.all([
				sql.raw("DELETE FROM pending_relations WHERE (user1 = $1 OR user2 = $1) AND (user1 = $2 OR user2 = $2)", [cmd.author.id, user.id]),
				sql.raw("DELETE FROM couples WHERE user1 = $1 OR user2 = $2", [cmd.author.id, user.id])
			])

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: `You declined ${sharedUtils.userString(user)}'s proposal`
			})
		}
	},
	{
		name: "divorce",
		description: "Divorces your significant other(s)",
		category: "couples",
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const married = await moneyManager.getCoupleRow(cmd.author.id)
			if (!married) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NONE
				})
			}

			const otherids = married.users.filter(id => id !== cmd.author.id)

			const [partners] = await Promise.all([
				Promise.all(otherids.map(u => sharedUtils.getUser(u, client.snow, client))),
				sql.raw("DELETE FROM couples WHERE user1 = $1 OR user2 = $1", [cmd.author.id]),
				sql.orm.delete("bank_accounts", { id: married.id }),
				sql.orm.delete("bank_access", { id: married.id })
			])

			for (const otherid of otherids) {
				const amount = BigInt(married.amount)
				const length = BigInt(otherids.length) // ensure each user would get AT LEAST 1
				if (amount > (length - BigInt(1))) {
					await moneyManager.awardAmount(otherid, amount / length, "Divorce inheritance")
				} else break
			}

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: `You divorced from ${partners.map(p => sharedUtils.userString(p)).join(", ")}`
			})
		}
	},
	{
		name: "withdraw",
		description: "Withdraw money from your couple balance",
		category: "couples",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to withdraw",
				required: true,
				min_value: 2
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const amount = BigInt(cmd.data.options.get("amount")!.asNumber()!)

			const married = await moneyManager.getCoupleRow(cmd.author.id)
			if (!married) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NONE
				})
			}

			const money = BigInt(married.amount)
			if (money === BigInt(0)) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "There is no money to withdraw"
				})
			}

			if (amount > money) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "You can't withdraw more than what is in the account"
				})
			}

			await Promise.all([
				sql.orm.update("bank_accounts", { amount: (money - amount).toString() }, { id: married.id }),
				sql.orm.insert("transactions", { user_id: cmd.author.id, amount: amount.toString(), mode: 1, description: `Withdrawl by ${cmd.author.id}`, target: married.id }),
				moneyManager.awardAmount(cmd.author.id, amount, "Withdrawl from shared account")
			]).catch(console.error)

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: `Successfully transacted ${sharedUtils.numberComma(amount)}`
			})
		}
	},
	{
		name: "deposit",
		description: "Deposit money to your couple balance",
		category: "couples",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to deposit",
				required: true,
				min_value: 2
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const amount = BigInt(cmd.data.options.get("amount")!.asNumber()!)

			const married = await moneyManager.getCoupleRow(cmd.author.id)
			const self = await moneyManager.getPersonalRow(cmd.author.id)
			if (!married) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NONE
				})
			}

			const money = BigInt(married.amount)
			const selfMoney = BigInt(self.amount)

			if (amount > selfMoney) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "You can't withdraw more than what is in the account"
				})
			}

			await Promise.all([
				sql.orm.update("bank_accounts", { amount: (money + amount).toString() }, { id: married.id }),
				sql.orm.insert("transactions", { user_id: cmd.author.id, amount: amount.toString(), mode: 0, description: `Deposit by ${cmd.author.id}`, target: married.id }),
				moneyManager.awardAmount(cmd.author.id, amount * BigInt(-1), "Deposit to shared account")
			]).catch(console.error)

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: `Successfully transacted ${sharedUtils.numberComma(amount)}`
			})
		}
	}/* ,
	{
		name: "coupleleaderboard",
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
				const usersToResolve = new Set()
				const userTagMap = new Map()
				const usersMap = new Map()
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
					.setFooter(utils.replace(lang.couples.coupleleaderboard.returns.pageCurrent, { "current": pageNumber, "total": lastAvailablePage }) + ` |${footerHelp}`) // SC: U+2002 EN SPACE
					.setColor(constants.money_embed_color)
				return msg.channel.send(await utils.contentify(msg.channel, embed))
			} else msg.channel.send(utils.replace(lang.gambling.leaderboard.prompts.pageLimit, { "username": msg.author.username, "maxPages": lastAvailablePage }))
		}
	}*/
])
