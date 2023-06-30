import { APIUser } from "discord-api-types/v10"
import passthrough = require("../passthrough")
const { commands, sql, confprovider, client, sync } = passthrough

import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")

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

			const users = [user, ...(await Promise.all(info.users.filter(u => u !== user.id).map(u => sharedUtils.getUser(u, client.snow, client)))).filter(u => !!u) as Array<APIUser>]

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						description: `${users.slice(0, -1).map(sharedUtils.userString).join(", ")} & ${sharedUtils.userString(users.slice(-1)[0])}`
						+ `\n\n${sharedUtils.numberComma(info.amount)} ${emojis.discoin}`,
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

			const [self, proposed] = await Promise.all([
				moneyManager.getCoupleRow(cmd.author.id),
				sql.orm.get("pending_relations", { user1: cmd.author.id, user2: user.id })
			])

			if (self) { // The user can't already be in a marriage. How would you join the relationships?
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "You're already married"
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

			const [userrel, selfrel, pending] = await Promise.all([
				moneyManager.getCoupleRow(user.id),
				moneyManager.getCoupleRow(cmd.author.id),
				sql.orm.get("pending_relations", { user1: user.id, user2: cmd.author.id })
			])

			if (!pending) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `${sharedUtils.userString(user)} hasn't propsed to you yet`
				})
			}

			if (userrel) {
				await sql.orm.delete("pending_relations", { user1: user.id, user2: cmd.author.id })
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `${sharedUtils.userString(user)} is already married`
				})
			}

			if (pending.user1 === cmd.author.id) {
				await sql.orm.delete("pending_relations", { user1: cmd.author.id, user2: cmd.author.id })
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "How did you propose to yourself???"
				})
			}

			await sql.orm.delete("pending_relations", { user1: user.id, user2: cmd.author.id })

			if (!selfrel) {
				const bank = await sql.get<{ id: number }>("INSERT INTO bank_accounts (type) VALUES ($1) RETURNING id", [1])
				if (!bank?.id) throw new Error("USER_MARRIED_NO_BANK_CREATED_FUCK_FUCK_FUCK")

				await sql.raw("INSERT INTO bank_access (id, user_id) VALUES ($1, $2), ($1, $3)", [bank.id, cmd.author.id, user.id])
			} else {
				await sql.orm.insert("bank_access", { id: selfrel.id, user_id: user.id })
			}

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: `${sharedUtils.userString(user)} is now married to ${sharedUtils.userString(cmd.author)}`
				+ (selfrel ? ` and ${selfrel.users.length - 1} other(s)` : "")
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

			const pending = await sql.orm.get("pending_relations", { user1: user.id, user2: cmd.author.id })

			if (!pending) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: `${sharedUtils.userString(user)} hasn't propsed to you yet`
				})
			}

			if (pending.user1 === cmd.author.id) {
				await sql.orm.delete("pending_relations", { user1: cmd.author.id, user2: cmd.author.id })
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: "How did you propose to yourself???"
				})
			}

			await sql.orm.delete("pending_relations", { user1: user.id, user2: cmd.author.id })

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: `You declined ${sharedUtils.userString(user)}'s proposal`
			})
		}
	},
	{
		name: "divorce",
		description: "Divorces your significant other(s)",
		category: "couples",
		options: [
			{
				name: "user",
				type: 6,
				description: "The user to remove from the marriage",
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

			const selfinfo = await moneyManager.getCoupleRow(cmd.author.id)

			if (!selfinfo) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NONE
				})
			}

			if (user.id !== cmd.author.id) {
				const userinfo = await moneyManager.getCoupleRow(user.id)

				if (!userinfo) {
					return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: `${sharedUtils.userString(user)} isn't married`
					})
				}

				if (selfinfo.id !== userinfo.id) {
					return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
						content: `${sharedUtils.userString(user)} isn't married to you`
					})
				}

				if (selfinfo.users.length !== 2) await sql.orm.delete("bank_access", { id: selfinfo.id, user_id: user.id })
				else { // now the only one left is the author. Give all to user and delete row
					await Promise.all([
						moneyManager.awardAmount(user.id, BigInt(selfinfo.amount), "Divorce inheritance"),
						sql.orm.delete("bank_access", { id: selfinfo.id }),
						sql.orm.delete("bank_accounts", { id: selfinfo.id })
					])
				}

				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: selfinfo.users.length === 2
						? `You divorced from ${sharedUtils.userString(user)}`
						: `You removed ${sharedUtils.userString(user)} from the marriage`
				})
			}

			const otherids = selfinfo.users.filter(id => id !== cmd.author.id)

			if (selfinfo.users.length !== 2) await sql.orm.delete("bank_access", { id: selfinfo.id, user_id: cmd.author.id })
			else {
				await Promise.all([
					moneyManager.awardAmount(otherids[0], BigInt(selfinfo.amount), "Divorce inheritance"),
					sql.orm.delete("bank_access", { id: selfinfo.id }),
					sql.orm.delete("bank_accounts", { id: selfinfo.id })
				])
			}

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: "You left the marriage"
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
			])

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

			const [married, self] = await Promise.all([
				moneyManager.getCoupleRow(cmd.author.id),
				moneyManager.getPersonalRow(cmd.author.id)
			])

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
			])

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: `Successfully transacted ${sharedUtils.numberComma(amount)}`
			})
		}
	},
	{
		name: "coupleleaderboard",
		description: "Shows the leaderboard for top couples of money",
		category: "couples",
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const itemsPerPage = 10

			const count = await sql.get<{ count: number }>("SELECT COUNT(*) AS count FROM bank_accounts WHERE type = 1").then(r => Math.ceil((r?.count ?? 0) / itemsPerPage))

			if (count === 0) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NONE
				})
			}

			return sharedUtils.paginate(count, async (page, btn) => {
				const offset = page * itemsPerPage
				const thisRows = await sql.all<{ id: string, amount: string }>(`SELECT bank_accounts.id, bank_accounts.amount FROM (SELECT DISTINCT ON (bank_access.id) bank_access.id FROM bank_access) temp INNER JOIN bank_accounts ON bank_accounts.id = temp.id WHERE bank_accounts.type = 1 ORDER BY bank_accounts.amount DESC LIMIT ${itemsPerPage} OFFSET ${offset}`)

				const usersToResolve = new Set<string>()
				const userTagMap = new Map<string, string>()
				const usersMap = new Map<string, Array<string>>()

				await Promise.all(thisRows.map(async row => {
					const users = await sql.orm.select("bank_access", { id: row.id }, { select: ["user_id"] }).then(rs => rs.map(r => r.user_id))
					users.forEach(u => usersToResolve.add(u))
					usersMap.set(row.id, users)
				}))

				await Promise.all([...usersToResolve].map(userID =>
					sharedUtils.getUser(userID, client.snow, client)
						.then(user => user ? sharedUtils.userString(user) : userID)
						.catch(() => userID) // fall back to userID if user no longer exists
						.then(display => userTagMap.set(userID, display))
				))

				const thisDisplayRows = thisRows.map((row, index) => {
					const ranking = itemsPerPage * page + index + 1
					const users = usersMap.get(row.id)!
					return [`${ranking}. ${sharedUtils.numberComma(row.amount)}`, `${users.slice(0, -1).map(u => userTagMap.get(u)).join(", ")} & ${userTagMap.get(users.slice(-1)[0])}`]
				})

				const thisTable = sharedUtils.tableifyRows(thisDisplayRows, ["left", "left"], () => "`")

				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							author: { name: "Couple Leaderboard" },
							description: thisTable.join("\n"),
							color: confprovider.config.standard_embed_color,
							footer: {
								text: langReplace(lang.GLOBAL.PAGE_X_OF_Y, { "current": page + 1, "total": count })
							}
						}
					],
					components: btn
						? [{ type: 1, components: [btn.component] }]
						: []
				})
			})
		}
	}
])
