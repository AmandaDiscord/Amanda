import fs from "fs"
import path from "path"

import Jimp from "jimp"

import passthrough from "../../passthrough"
const { client, constants, config, commands, sync } = passthrough

const arr: typeof import("../utils/array") = sync.require("../utils/array")
const orm: typeof import("../utils/orm") = sync.require("../utils/orm")
const jimpStores: typeof import("../utils/jimpstores") = sync.require("../utils/jimpstores")
const discord: typeof import("../utils/discord") = sync.require("../utils/discord")
const text: typeof import("../utils/string") = sync.require("../utils/string")
const language: typeof import("../utils/language") = sync.require("../utils/language")

const startingCoins = 5000

async function getPersonalRow(userID: string) {
	const row = await orm.db.raw("SELECT bank_accounts.id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id WHERE bank_access.user_id = $1 AND bank_accounts.type = 0", [userID]) as [{ id: string; amount: string }]
	if (row && Array.isArray(row) && row[0]) return row[0]
	else {
		const newRow = await orm.db.raw("INSERT INTO bank_accounts (amount) VALUES ($1) RETURNING id", [startingCoins]) as [{ id: string }] // default type is 0 which is personal acc. No need to specify
		if (!newRow || Array.isArray(newRow) && !newRow[0]) throw new Error("NO_CREATE_BANK_ACCOUNT_ID")
		const accID = newRow[0].id
		await orm.db.insert("bank_access", { id: accID, user_id: userID })
		return { id: accID, amount: String(startingCoins) }
	}
}

async function getCoupleRow(userID: string) {
	const row = await orm.db.raw("SELECT bank_accounts.id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id WHERE bank_access.user_id = $1 AND bank_accounts.type = 1", [userID]) as [{ id: string; amount: string }]
	if (!row || Array.isArray(row) && !row[0]) return null
	const bank = row[0]
	const inCoupleBank = await orm.db.select("bank_access", { id: bank.id }, { select: ["user_id"] }).then(rs => rs.map(r => r.user_id))
	return { id: bank.id, amount: bank.amount, users: inCoupleBank }
}

async function awardAmount(userID: string, value: bigint, reason: string) {
	const row = await getPersonalRow(userID)
	await Promise.all([
		orm.db.update("bank_accounts", { amount: (BigInt(row.amount) + value).toString() }, { id: row.id }),
		orm.db.insert("transactions", { user_id: client.user.id, amount: (value < BigInt(0) ? (value * BigInt(-1)) : value).toString(), mode: value < BigInt(0) ? 1 : 0, description: reason, target: row.id })
	])
}

async function transact(from: string, to: string, amount: bigint) {
	const fromRow = await getPersonalRow(from)
	const toRow = await getPersonalRow(to)

	await Promise.all([
		orm.db.update("bank_accounts", { amount: (BigInt(toRow.amount) + amount).toString() }, { id: toRow.id }),
		orm.db.update("bank_accounts", { amount: (BigInt(fromRow.amount) - amount).toString() }, { id: fromRow.id }),
		orm.db.insert("transactions", { user_id: from, amount: amount.toString(), mode: 0, description: `transfer to ${to}`, target: toRow.id }), // Mode 0 is send. 1 is receive.
		orm.db.insert("transactions", { user_id: to, amount: amount.toString(), mode: 1, description: `transfer from ${from}`, target: fromRow.id })
	])
}

type CooldownInfo = { max: number; min: number; step: number; regen: { amount: number; time: number; } }

async function updateCooldown(userID: string, command: string, info: CooldownInfo) {
	let winChance = info.max
	const uidcmdpl = { user_id: userID, command: command }
	const cooldown = await orm.db.get("money_cooldown", uidcmdpl)
	if (cooldown) {
		winChance = Math.max(info.min, Math.min(info.max, Number(cooldown.value) + Math.floor((Date.now() - Number(cooldown.date)) / info.regen.time) * info.regen.amount))
		const newValue = winChance - info.step
		orm.db.update("money_cooldown", { date: Date.now(), value: newValue }, uidcmdpl)
	} else orm.db.insert("money_cooldown", { user_id: userID, command: command, date: Date.now(), value: info.max - info.step })
	return winChance
}

const datemap = {
	0: "January",
	1: "February",
	2: "March",
	3: "April",
	4: "May",
	5: "June",
	6: "July",
	7: "August",
	8: "September",
	9: "October",
	10: "November",
	11: "December"
}

commands.assign([
	{
		name: "slots",
		description: "Run the slot machine",
		category: "gambling",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to bet",
				required: false,
				min_value: 2
			}
		],
		async process(cmd, lang) {
			if (!config.db_enabled) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.DATABASE_OFFLINE })

			const fruits = ["apple", "cherries", "watermelon", "pear", "strawberry"] // plus heart, which is chosen seperately
			const isPremium = await orm.db.get("premium", { user_id: cmd.author.id })
			let cooldownInfo: { max: number; min: number; step: number; regen: { amount: number; time: number; } }
			// avg % assumes 5 fruits + heart, heart payouts [0, 1.25, 4, 20], triple fruit payout 5
			if (isPremium) {
				cooldownInfo = {
					max: 190, // avg +6.2% per roll
					min: 172, // avg -4.8% per roll
					step: 6, // 4 rolls to hit the bottom
					regen: {
						amount: 1,
						time: 20 * 1000 // 2 minutes to recover by 1 roll
					}
				}
			} else {
				cooldownInfo = {
					max: 186, // avg +3.6% per roll
					min: 164, // avg -9.4% per roll
					step: 7, // 4.6 rolls to hit the bottom
					regen: {
						amount: 1,
						time: 30 * 1000 // 3.5 minutes to recover by 1 roll
					}
				}
			}

			const [money, winChance, images] = await Promise.all([
				getPersonalRow(cmd.author.id),
				updateCooldown(cmd.author.id, "slot", cooldownInfo),
				jimpStores.images.getAll(["slot-background", "emoji-apple", "emoji-cherries", "emoji-heart", "emoji-pear", "emoji-strawberry", "emoji-watermelon"])
			])

			const slots: Array<string> = []
			for (let i = 0; i < 3; i++) {
				if (Math.random() < winChance / 1000) slots[i] = "heart"
				else slots[i] = arr.random(fruits)
			}

			const canvas = images.get("slot-background")!.clone()
			const pieces: Array<import("jimp")> = []
			slots.forEach(i => pieces.push(images.get(`emoji-${i}`)!.resize(85, 85)))

			canvas.composite(pieces[0], 100, 560)
			canvas.composite(pieces[1], 258, 560)
			canvas.composite(pieces[2], 412, 560)

			const amount = cmd.data.options.get("amount")?.asNumber()

			if (!amount) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { files: [{ name: "slot.png", file: await canvas.getBufferAsync(Jimp.MIME_PNG) }] })

			const bet = BigInt(amount)
			if (bet > BigInt(money.amount)) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You don't have enough money for that" })

			let result: string, winning: bigint
			if (slots.every(s => s == "heart")) {
				winning = bet * BigInt(20)
				result = "WOAH! 3 hearts!"
			} else if (slots.filter(s => s == "heart").length == 2) {
				winning = bet * BigInt(4)
				result = "Double hearts :heart:"
			} else if (slots.filter(s => s == "heart").length == 1) {
				winning = bet + (bet / BigInt(3))
				result = "1 heart"
			} else if (slots.slice(1).every(s => s == slots[0])) {
				winning = bet * BigInt(5)
				result = "Triple pieces"
			} else {
				winning = BigInt(0)
				result = "You lost"
			}

			await awardAmount(cmd.author.id, winning - bet, "NEKO Casino slot machine")
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: result, files: [{ name: "slot.png", file: await canvas.getBufferAsync(Jimp.MIME_PNG) }] })
		}
	},
	{
		name: "flip",
		description: "Flips a coin",
		category: "gambling",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to bet",
				required: false,
				min_value: 2
			},
			{
				name: "side",
				type: 3,
				description: "The side to bet on",
				required: false,
				choices: [
					{
						name: "heads",
						value: "h"
					},
					{
						name: "tails",
						value: "t"
					}
				]
			}
		],
		async process(cmd) {
			const amount = cmd.data.options.get("amount")?.asNumber() ?? null
			let side = (cmd.data.options.get("side")?.asString() ?? null) as "h" | "t" | null
			if (!amount || !config.db_enabled) {
				const flip = arr.random(["<:coinH:402219464348925954>", "<:coinT:402219471693021196>"])
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: flip })
			}

			const money = await getPersonalRow(cmd.author.id)
			const bet = BigInt(amount)
			if (bet > BigInt(money.amount)) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You don't have enough money for that" })

			let selfChosenSide = false
			if (!side) {
				side = Math.random() < 0.5 ? "h" : "t"
				selfChosenSide = true
			}
			const isPremium = await orm.db.get("premium", { user_id: cmd.author.id })
			let cooldownInfo: CooldownInfo
			if (isPremium) {
				cooldownInfo = {
					max: 48,
					min: 40,
					step: 2,
					regen: {
						amount: 1,
						time: 1.5 * 60 * 1000
					}
				}
			} else {
				cooldownInfo = {
					max: 48,
					min: 40,
					step: 2,
					regen: {
						amount: 1,
						time: 2 * 60 * 1000
					}
				}
			}

			const winChance = await updateCooldown(cmd.author.id, "bf", cooldownInfo)
			if (Math.random() < winChance / 100) {
				const winnings = bet + (bet / BigInt(3))
				await awardAmount(cmd.author.id, winnings, "NEKO Casino coin flip")
				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${selfChosenSide ? `Since you didn't choose a side, I chose ${side} for you and you` : `You guessed ${side} and`} won ${text.numberComma(winnings)} (+33%)` })
			} else {
				await awardAmount(cmd.author.id, -bet, "NEKO Casino coin flip")
				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `${selfChosenSide ? `Since you didn't choose a side, I chose ${side} for you and you` : `You guessed ${side} and`} lost ${text.numberComma(bet)}` })
			}
		}
	},
	{
		name: "money",
		description: "Shows how much money you/another person/the couple has",
		category: "gambling",
		options: [
			{
				name: "user",
				type: 6,
				description: "The user to get info on",
				required: false
			},
			{
				name: "couple",
				type: 5,
				description: "Whether to show the couple balance",
				required: false
			}
		],
		async process(cmd, lang) {
			if (!config.db_enabled) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.DATABASE_OFFLINE })
			const user = cmd.data.users.get(cmd.data.options.get("user")?.asString() ?? "") ?? cmd.author
			const showCouple = cmd.data.options.get("couple")?.asBoolean() ?? false

			const money = await getPersonalRow(user.id)
			const couple = await getCoupleRow(user.id)

			const [fonts, images, avatar] = await Promise.all([
				jimpStores.fonts.getAll(["arial-16", "arial-24", "bahnschrift-22", "bahnschrift-22-red", "bahnschrift-22-green"]),
				jimpStores.images.getAll(["bank", "card1", "card2", "card-overlap-mask", "circle-mask", "circle-overlap-mask", "add-circle", "neko"]),
				discord.getAvatarJimp(user)!
			])

			const font = fonts.get("arial-16")!
			const font2 = fonts.get("bahnschrift-22")!
			const font3 = fonts.get("arial-24")!
			const redsus = fonts.get("bahnschrift-22-red")!
			const greensus = fonts.get("bahnschrift-22-green")!

			const canvas = images.get("bank")!
			const card1 = images.get("card1")!
			const card2 = images.get("card2")!
			const overlap = images.get("card-overlap-mask")!
			const circleMask = images.get("circle-mask")!
			const addCircle = images.get("add-circle")!
			const circleOverlap = images.get("circle-overlap-mask")!
			const neko = images.get("neko")!

			canvas.print(font3, 40, 70, { text: `${user.username}#${user.discriminator}`, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 400, 50)

			const avatarSize = 30
			const avatarStartX = 21
			const avatarStartY = 138
			const cardSizes = [400, 225]
			const cardOffset = 95

			avatar.resize(avatarSize, avatarSize)
			circleMask.resize(avatarSize, avatarSize)
			circleOverlap.resize(avatarSize, avatarSize)
			addCircle.resize(avatarSize, avatarSize)
			addCircle.mask(circleOverlap, 0, 0)
			avatar.mask(circleMask, 0, 0)

			const makefakeCardEnding = (personal: boolean) => `**** ${(!personal && !!couple ? couple.users.slice(0, 2) : [user.id]).reduce((acc, cur) => acc + BigInt(cur), BigInt(0)).toString().slice(-4)}`
			const fakePersonal = makefakeCardEnding(true)
			const fakeCouple = makefakeCardEnding(false)

			async function buildCard(card: import("jimp"), personal = true, page = 1) {
				let mask = false
				if ((personal && page === 2) || (!personal && page === 1)) {
					mask = true
					card.mask(overlap, 0, 0)
				}
				card.print(font, 25, 25, personal ? "Private card" : "Family card")
				card.print(font2, 170, 5, { text: text.abbreviateNumber(personal ? money.amount : couple!.amount), alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 150, 50)
				card.print(font, 25, 45, personal ? fakePersonal : fakeCouple)

				if (!mask) {
					let avatars: Array<import("jimp")> = [avatar]
					if (!personal) avatars = await Promise.all(couple!.users.map(async u => discord.getAvatarJimp(await discord.getUser(u) || { id: "643945264868098049", username: "Discord", discriminator: "0000", avatar: null }))).then(pfps => pfps.map(a => a.resize(avatarSize, avatarSize).mask(circleMask, 0, 0)))
					const offset = 24

					card.composite(avatars[0], avatarStartX, avatarStartY)
					avatars.slice(1).forEach((pfp, index) => card.composite(pfp.mask(circleOverlap, 0, 0), avatarStartX + ((index + 1) * offset), avatarStartY))
					card.composite(addCircle, avatarStartX + (avatars.length * offset), avatarStartY)
					card.composite(neko, 227, 140)
				}

				card.resize(cardSizes[0], cardSizes[1])

				return card
			}

			const transactionOffset = 70

			async function printTransactions(page: import("jimp"), id: string, fakeID: string) {
				const transactions = await orm.db.select("transactions", { target: id }, { order: "date", orderDescending: true, limit: 7 })

				transactions.forEach((transaction, index) => {
					const indexoffset = 570 + (index * transactionOffset)
					page.print(font2, 30, indexoffset, transaction.description)
					page.print(transaction.mode === 0 ? greensus : redsus, 360, indexoffset - 10, { text: `${transaction.mode === 0 ? "+" : "-"}${text.abbreviateNumber(transaction.amount)}`, alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 100, 50)
					page.print(font, 30, indexoffset + 30, fakeID)
					const date = new Date(transaction.date)
					page.print(font, 360, indexoffset + 20, { text: `${text.position(date.getDate())} ${datemap[date.getMonth()]}`, alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 100, 50)
				})
			}

			async function buildPage1() {
				const dupe = canvas.clone()
				const c2dupe = card2.clone()
				const c1dupe = card1.clone()

				const promises: Array<Promise<import("jimp")>> = []
				promises.push(buildCard(c1dupe, true, 1))
				if (couple) promises.push(buildCard(c2dupe, false, 1))
				const cards = await Promise.all(promises)

				let offset = 0

				if (couple) {
					offset = cardOffset
					dupe.composite(cards[1], 42, 150)
				}

				dupe.composite(cards[0], 42, 150 + offset)

				dupe.print(font3, 170, 525, "Transactions:")
				await printTransactions(dupe, money.id, fakePersonal)

				return dupe
			}

			async function buildPage2() {
				const dupe = canvas.clone()
				const c2dupe = card2.clone()
				const c1dupe = card1.clone()

				const promises = [buildCard(c2dupe, false, 2), buildCard(c1dupe, true, 2)]
				const cards = await Promise.all(promises)

				dupe.composite(cards[1], 42, 150)
				dupe.composite(cards[0], 42, 150 + cardOffset)
				dupe.print(font3, 170, 525, "Transactions:")
				await printTransactions(dupe, couple!.id, fakeCouple)

				return dupe
			}

			const buffer = await (couple && showCouple ? buildPage2() : buildPage1()).then(c => c.getBufferAsync(Jimp.MIME_PNG))
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { files: [{ name: "money.png", file: buffer }] })
		}
	},
	{
		name: "leaderboard",
		description: "Shows the leaderboard for top users of money",
		category: "gambling",
		options: [
			{
				name: "page",
				type: 4,
				description: "The page of the leaderboard to view",
				required: false,
				min_value: 1,
				max_value: 20
			}
		],
		async process(cmd, lang) {
			if (!config.db_enabled) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.DATABASE_OFFLINE })
			const itemsPerPage = 10

			let pageNumber = cmd.data.options.get("page")?.asNumber() ?? null

			if (!pageNumber) pageNumber = 1

			const offset = (pageNumber - 1) * itemsPerPage

			const rows = await orm.db.raw(`SELECT bank_access.user_id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id WHERE bank_accounts.type = 0 ORDER BY bank_accounts.amount DESC LIMIT ${itemsPerPage} OFFSET ${offset}`) as Array<{ user_id: string; amount: string }>
			const availableRowCount = (await orm.db.raw("SELECT COUNT(*) AS count FROM bank_accounts WHERE type = 0").then(r => r[0])).count as number

			const lastAvailablePage = Math.min(Math.ceil(availableRowCount / itemsPerPage), 20)

			if (rows.length) {
				const displayRows = await Promise.all(rows.map(async ({ user_id, amount }, index) => {
					const tag = await discord.getUser(user_id)
						.then(user => `${user ? `${user.username}#${user.discriminator}` : user_id}`)
						.catch(() => user_id)
					const ranking = itemsPerPage * (pageNumber! - 1) + index + 1
					return [`${ranking}. ${text.numberComma(amount)}`, tag]
				}))

				const table = arr.tableifyRows(displayRows, ["left", "left"], () => "`")

				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							author: { name: "Leaderboard" },
							description: table.join("\n"),
							footer: { text: language.replace(lang.GLOBAL.PAGE_X_OF_Y, { "current": pageNumber, "total": lastAvailablePage }) },
							color: constants.standard_embed_color
						}
					]
				})
			} else return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `There are no rows to display on this page. The last page is page ${lastAvailablePage}` })
		}
	},
	{
		name: "give",
		description: "Gives another user money",
		category: "gambling",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to give",
				required: true,
				min_value: 1
			},
			{
				name: "user",
				type: 6,
				description: "The user to give money to",
				required: true
			}
		],
		async process(cmd, lang) {
			if (!config.db_enabled) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.DATABASE_OFFLINE })
			const user = cmd.data.users.get(cmd.data.options.get("user")!.asString()!)!
			const amount = BigInt(cmd.data.options.get("amount")!.asNumber()!)
			if (user.id == cmd.author.id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You cannot give money to yourself" })
			const authorCoins = await getPersonalRow(cmd.author.id)
			if (amount > BigInt(authorCoins.amount)) client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You don't have enough money for that" })
			transact(cmd.author.id, user.id, amount)
			client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `You have given ${text.numberComma(amount)} to ${user.username}#${user.discriminator}` })
		}
	},
	{
		name: "wheel",
		description: "Spin the wheel of (mis)fortune",
		category: "gambling",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to bet",
				required: true,
				min_value: 2
			}
		],
		async process(cmd, lang) {
			if (!config.db_enabled) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.DATABASE_OFFLINE })
			const money = await getPersonalRow(cmd.author.id)
			const amount = BigInt(cmd.data.options.get("amount")!.asNumber()!)

			if (amount > BigInt(money.amount)) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "You don't have enough money for that" })

			const choices = [[0, 0], [1, 0], [2, 5], [3, 2], [4, 0], [5, 1], [6, 0], [7, 0]] as Array<[number, number]>
			const choice = arr.random(choices)

			const image = await fs.promises.readFile(path.join(__dirname, `../../../images/precalculated/${choice[0]}.png`))

			const award = (amount * BigInt(choice[1])) - amount
			await awardAmount(cmd.author.id, award, `Wheel Of ${award <= BigInt(0) ? "Misf" : "F"}ortune`)
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `You bet ${amount} and won ${award}`, files: [{ name: "wheel.png", file: image }] })
		}
	}
])
