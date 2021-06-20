// @ts-check

const Jimp = require("jimp")
const Discord = require("thunderstorm")

const emojis = require("../emojis")

const passthrough = require("../passthrough")
const { constants, commands, sync } = passthrough

const dailyCooldownHours = 20
const dailyCooldownTime = dailyCooldownHours * 60 * 60 * 1000

/**
 * @type {import("../modules/utilities")}
 */
const utils = sync.require("../modules/utilities")

commands.assign([
	{
		usage: "[amount: number|all|half]",
		description: "*slaps top of slot machine.* This baby can make you loose all your amandollars",
		aliases: ["slot", "slots"],
		category: "gambling",
		examples: ["slot 1000"],
		async process(msg, suffix, lang) {
			if (msg.channel.type === "dm") return msg.channel.send(utils.replace(lang.gambling.slot.prompts.guildOnly, { "username": msg.author.username }))
			if (!(await utils.cacheManager.channels.clientHasPermission({ id: msg.channel.id, guild_id: msg.guild.id }, "ATTACH_FILES"))) return msg.channel.send(lang.gambling.slot.prompts.permissionDenied)
			await msg.channel.sendTyping()
			const args = suffix.split(" ")
			const fruits = ["apple", "cherries", "watermelon", "pear", "strawberry"] // plus heart, which is chosen seperately
			const isPremium = await utils.sql.get("SELECT * FROM premium WHERE user_id = $1", msg.author.id)
			let cooldownInfo
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
				utils.coinsManager.get(msg.author.id),
				utils.coinsManager.updateCooldown(msg.author.id, "slot", cooldownInfo),
				utils.jimpStores.images.getAll(["slot-background", "slot-amanda", "slot-machine", "slot-top", "emoji-apple", "emoji-cherries", "emoji-heart", "emoji-pear", "emoji-strawberry", "emoji-watermelon"])
			])
			// console.log(money, winChance)
			const slots = []
			for (let i = 0; i < 3; i++) {
				if (Math.random() < winChance / 1000) slots[i] = "heart"
				else slots[i] = utils.arrayRandom(fruits)
			}

			const canvas = images.get("slot-background").clone()
			canvas.composite(images.get("slot-amanda").clone(), 0, 0)
			canvas.composite(images.get("slot-machine").clone(), 0, 0)
			const pieces = []
			slots.forEach(i => pieces.push(images.get(`emoji-${i}`).resize(85, 85)))

			canvas.composite(pieces[0], 100, 560)
			canvas.composite(pieces[1], 258, 560)
			canvas.composite(pieces[2], 412, 560)

			canvas.composite(images.get("slot-top").clone(), 0, 0)

			let buffer, image
			if (!args[0]) {
				buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
				image = new Discord.MessageAttachment(buffer, "slot.png")
				return msg.channel.send({ files: [image] })
			}
			let bet
			if (args[0] == "all" || args[0] == "half") {
				if (money <= BigInt(0)) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (args[0] === "all") bet = money
				else bet = money / BigInt(2)
			} else {
				bet = utils.parseBigInt(args[0])
				if (!bet) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.invalidBet, { "username": msg.author.username }))
				if (bet < BigInt(2)) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.betSmall, { "username": msg.author.username }))
				if (bet > money) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.moneyInsufficient, { "username": msg.author.username }))
			}
			let result, winning
			if (slots.every(s => s == "heart")) {
				winning = bet * (["all", "half"].includes(args[0]) ? BigInt(25) : BigInt(20))
				result = utils.replace(lang.gambling.slot.returns.heart3, { "number": utils.numberComma(winning) })
			} else if (slots.filter(s => s == "heart").length == 2) {
				winning = bet * (["all", "half"].includes(args[0]) ? BigInt(6) : BigInt(4))
				result = utils.replace(lang.gambling.slot.returns.heart2, { "number": utils.numberComma(winning) })
			} else if (slots.filter(s => s == "heart").length == 1) {
				winning = bet + (["all", "half"].includes(args[0]) ? bet / BigInt(2) : bet / BigInt(3))
				result = utils.replace(lang.gambling.slot.returns.heart1, { "number": utils.numberComma(winning) })
			} else if (slots.slice(1).every(s => s == slots[0])) {
				winning = bet * (["all", "half"].includes(args[0]) ? BigInt(7) : BigInt(5))
				result = utils.replace(lang.gambling.slot.returns.triple, { "number": utils.numberComma(winning) })
			} else {
				winning = BigInt(0)
				result = utils.replace(lang.gambling.slot.returns.lost, { "number": utils.numberComma(bet) })
			}
			utils.coinsManager.award(msg.author.id, winning - bet, "NEKO Casino slot machine")
			buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			image = new Discord.MessageAttachment(buffer, "slot.png")
			return msg.channel.send({ content: result, files: [image] })
		}
	},
	{
		usage: "None",
		description: "Flips a coin",
		aliases: ["flip"],
		category: "gambling",
		examples: ["flip"],
		process(msg, suffix, lang) {
			const flip = utils.arrayRandom(["heads <:coinH:402219464348925954>", "tails <:coinT:402219471693021196>"])
			return msg.channel.send(utils.replace(lang.gambling.flip.returns.flip, { "flip": flip }))
		}
	},
	{
		usage: "<amount: number|all|half> [h|t]",
		description: "Place a bet on a random flip for a chance of Discoins",
		aliases: ["betflip", "bf"],
		category: "gambling",
		examples: ["bf 1000 h"],
		async process(msg, suffix, lang) {
			if (msg.channel.type === "dm") return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.guildOnly, { "username": msg.author.username }))
			const args = suffix.split(" ")
			const money = await utils.coinsManager.get(msg.author.id)
			if (!args[0]) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.invalidBetandSide, { "username": msg.author.username }))
			if (args[0] == "h" || args[0] == "t") {
				const t = args[0]
				args[0] = args[1]
				args[1] = t
			}
			let bet
			if (args[0] == "all" || args[0] == "half") {
				if (money <= BigInt(0)) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (args[0] == "all") {
					bet = money
				} else {
					bet = money / BigInt(2)
				}
			} else {
				bet = utils.parseBigInt(args[0])
				if (!bet) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.invalidBet, { "username": msg.author.username }))
				if (bet < 1) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.betSmall, { "username": msg.author.username }))
				if (bet > money) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.moneyInsufficient, { "username": msg.author.username }))
			}
			let selfChosenSide = false
			if (!args[1]) {
				args[1] = Math.random() < 0.5 ? "h" : "t"
				selfChosenSide = true
			}
			if (args[1] != "h" && args[1] != "t") return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.invalidSide, { "username": msg.author.username }))
			const isPremium = await utils.sql.get("SELECT * FROM premium WHERE user_id = $1", msg.author.id)
			let cooldownInfo
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

			const winChance = await utils.coinsManager.updateCooldown(msg.author.id, "bf", cooldownInfo)
			const strings = {
				h: ["heads", "<:coinH:402219464348925954>"],
				t: ["tails", "<:coinT:402219471693021196>"]
			}
			if (Math.random() < winChance / 100) {
				const winnings = bet + (["all", "half"].includes(args[0]) ? bet / BigInt(2) : bet / BigInt(3))
				const explanation = `(+${["all", "half"].includes(args[0]) ? 50 : 33}%)`
				msg.channel.send(
					(!selfChosenSide ? "" : `${lang.gambling.betflip.returns.autoChoose} ${strings[args[1]][0]}\n`) +
					utils.replace(lang.gambling.betflip.returns.guess, { "string1": `${strings[args[1]][0]}.\n${strings[args[1]][1]}`, "string2": `${strings[args[1]][0]}` }) +
					`.\n${utils.replace(lang.gambling.betflip.returns.win, { "number": utils.numberComma(winnings), "explanation": explanation })}`
				)
				utils.coinsManager.award(msg.author.id, winnings, "NEKO Casino coin flip")
			} else {
				const pick = args[1] == "h" ? "t" : "h"
				msg.channel.send(
					(!selfChosenSide ? "" : `${lang.gambling.betflip.returns.autoChoose} ${strings[args[1]][0]}\n`) +
					utils.replace(lang.gambling.betflip.returns.guess, { "string1": `${strings[args[1]][0]}.\n${strings[pick][1]}`, "string2": `${strings[pick][0]}` }) +
					`.\n${utils.replace(lang.gambling.betflip.returns.lost, { "number": utils.numberComma(bet) })}`
				)
				return utils.coinsManager.award(msg.author.id, -bet, "NEKO Casino coin flip")
			}
		}
	},
	{
		usage: "[user] [--couple]",
		description: "Returns the amount of Discoins you or another user has",
		aliases: ["coins", "$", "balance", "bal", "discoins", "amandollars"],
		category: "gambling",
		examples: ["coins PapiOphidian"],
		async process(msg, suffix, lang) {
			let user, member, showCouple = false
			if (suffix.match(/ --couple$/)) {
				showCouple = true
				suffix = suffix.replace(/ --couple$/, "")
			}
			if (msg.channel.type == "text") {
				member = await utils.cacheManager.members.find(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix, true)
			if (!user) return msg.channel.send(utils.replace(lang.gambling.coins.prompts.invalidUser, { "username": msg.author.username }))
			const money = await utils.coinsManager.getPersonalRow(user.id)
			const couple = await utils.coinsManager.getCoupleRow(user.id)

			if (!(await utils.cacheManager.channels.clientHasPermission({ id: msg.channel.id, guild_id: msg.guild ? msg.guild.id : undefined }, "ATTACH_FILES"))) {
				const embed = new Discord.MessageEmbed()
					.setAuthor(utils.replace(lang.gambling.coins.returns.coins, { "display": member ? `${user.tag}${member.nickname ? `(${member.nickname})` : ""}` : user.tag }))
					.setDescription(`${utils.numberComma(money.amount)} ${emojis.discoin}`)
					.setColor(constants.money_embed_color)
				return msg.channel.send(await utils.contentify(msg.channel, embed))
			}

			await msg.channel.sendTyping()

			const [fonts, images, avatar] = await Promise.all([
				utils.jimpStores.fonts.getAll(["arial-16", "arial-24", "bahnschrift-22", "bahnschrift-22-red", "bahnschrift-22-green"]),
				utils.jimpStores.images.getAll(["bank", "card1", "card2", "card-overlap-mask", "circle-mask", "circle-overlap-mask", "add-circle", "neko"]),
				utils.getAvatarJimp(user.id)
			])

			const font = fonts.get("arial-16")
			const font2 = fonts.get("bahnschrift-22")
			const font3 = fonts.get("arial-24")
			const redsus = fonts.get("bahnschrift-22-red")
			const greensus = fonts.get("bahnschrift-22-green")

			const canvas = images.get("bank")
			const card1 = images.get("card1")
			const card2 = images.get("card2")
			const overlap = images.get("card-overlap-mask")
			const circleMask = images.get("circle-mask")
			const addCircle = images.get("add-circle")
			const circleOverlap = images.get("circle-overlap-mask")
			const neko = images.get("neko")

			canvas.print(font3, 40, 70, { text: user.tag, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 400, 50)

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

			/**
			 * @param {boolean} personal
			 */
			const makefakeCardEnding = (personal) => `**** ${(!personal && !!couple ? couple.users.slice(0, 2) : [user.id]).reduce((acc, cur) => acc + BigInt(cur), BigInt(0)).toString().slice(-4)}`
			const fakePersonal = makefakeCardEnding(true)
			const fakeCouple = makefakeCardEnding(false)

			/**
			 * @param {Jimp} card
			 * @param {boolean} [personal]
			 * @param {number} [page]
			 */
			async function buildCard(card, personal = true, page = 1) {
				let mask = false
				if ((personal && page === 2) || (!personal && page === 1)) {
					mask = true
					card.mask(overlap, 0, 0)
				}
				card.print(font, 25, 25, personal ? "Private card" : "Family card")
				card.print(font2, 170, 5, { text: utils.abbreviateNumber(personal ? money.amount : couple.amount), alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 150, 50)
				card.print(font, 25, 45, personal ? fakePersonal : fakeCouple)

				if (!mask) {
					let avatars
					if (!personal) avatars = await Promise.all(couple.users.map(u => utils.getAvatarJimp(u))).then(pfps => pfps.map(a => a.resize(avatarSize, avatarSize).mask(circleMask, 0, 0)))
					else avatars = [avatar]
					const offset = 24

					card.composite(avatars[0], avatarStartX, avatarStartY)
					avatars.slice(1).map((pfp, index) => card.composite(pfp.mask(circleOverlap, 0, 0), avatarStartX + ((index + 1) * offset), avatarStartY))
					card.composite(addCircle, avatarStartX + (avatars.length * offset), avatarStartY)
					card.composite(neko, 227, 140)
				}

				card.resize(cardSizes[0], cardSizes[1])

				return card
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

			const transactionOffset = 70

			/**
			 * @param {Jimp} page
			 * @param {string} id
			 * @param {string} fakeID
			 */
			async function printTransactions(page, id, fakeID) {
				const transactions = await utils.orm.db.select("transactions", { target: id }, { order: "date", orderDescending: true, limit: 7 })

				transactions.forEach((transaction, index) => {
					const indexoffset = 570 + (index * transactionOffset)
					page.print(font2, 30, indexoffset, transaction.description)
					page.print(transaction.mode === 0 ? greensus : redsus, 360, indexoffset - 10, { text: `${transaction.mode === 0 ? "+" : "-"}${utils.abbreviateNumber(transaction.amount)}`, alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 100, 50)
					page.print(font, 30, indexoffset + 30, fakeID)
					const date = new Date(transaction.date)
					page.print(font, 360, indexoffset + 20, { text: `${utils.numberPosition(date.getDay())} ${datemap[date.getMonth()]}`, alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 100, 50)
				})
			}

			async function buildPage1() {
				const dupe = canvas.clone()
				const c2dupe = card2.clone()
				const c1dupe = card1.clone()

				const promises = []
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
				await printTransactions(dupe, couple.id, fakeCouple)

				return dupe
			}

			const buffer = await (couple && showCouple ? buildPage2() : buildPage1()).then(c => c.getBufferAsync(Jimp.MIME_PNG))
			const image = new Discord.MessageAttachment(buffer, "money.png")
			return msg.channel.send({ files: [image] })
		}
	},
	{
		usage: "None",
		description: "A daily command that gives a random amount of Discoins",
		aliases: ["daily"],
		category: "gambling",
		examples: ["daily"],
		async process(msg, suffix, lang) {
			if (msg.channel.type === "dm") return msg.channel.send(utils.replace(lang.gambling.daily.prompts.guildOnly, { "username": msg.author.username }))
			const [row, donor] = await Promise.all([
				utils.sql.get("SELECT last_claim FROM daily_cooldown WHERE user_id = $1", msg.author.id),
				utils.sql.get("SELECT * FROM premium WHERE user_id = $1", msg.author.id)
			])
			if (!row || Number(row.last_claim) + dailyCooldownTime < Date.now()) {
				let amount
				if (donor) amount = BigInt(Math.floor(Math.random() * (750 - 500) + 500) + 1)
				else amount = BigInt(Math.floor(Math.random() * (500 - 100) + 100) + 1)
				const embed = new Discord.MessageEmbed()
					.setDescription(utils.replace(lang.gambling.daily.returns.claimed, { "username": msg.author.username, "number": amount.toString() }))
					.setColor(constants.money_embed_color)
				msg.channel.send(await utils.contentify(msg.channel, embed))
				utils.coinsManager.award(msg.author.id, amount, "NEKOIRS TREAS 310 TAX REF")
				utils.orm.db.upsert("daily_cooldown", { user_id: msg.author.id, last_claim: Date.now() })
			} else {
				const timeRemaining = utils.shortTime(Number(row.last_claim) - Date.now() + dailyCooldownTime, "ms")
				msg.channel.send(utils.replace(lang.gambling.daily.prompts.cooldown, { "username": msg.author.username, "number": timeRemaining }))
			}
		}
	},
	{
		usage: "[local] [page: number]",
		description: "Gets the leaderboard for people with the most coins",
		aliases: ["leaderboard", "lb"],
		category: "gambling",
		examples: ["lb 2"],
		async process(msg, suffix, lang, prefixes) {
			const maxPages = 20
			const itemsPerPage = 10

			const args = suffix.split(" ")

			// Set up local
			const isLocal = ["local", "guild", "server"].includes(args[0])

			if (isLocal) {
				if (msg.channel.type === "dm") return msg.channel.send(utils.replace(lang.gambling.coins.prompts.guildOnly, { "username": msg.author.username }))
				args.shift() // if it exists, page number will now definitely be in args[0]
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
				rows = await utils.sql.all(`SELECT bank_access.user_id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id INNER JOIN members ON bank_access.user_id = members.id WHERE members.guild_id = $1 AND bank_accounts.type = 0 ORDER BY bank_accounts.amount DESC LIMIT ${maxPages * itemsPerPage}`, msg.guild.id)
				availableRowCount = rows.length
				rows = rows.slice(itemsPerPage * (pageNumber - 1), itemsPerPage * pageNumber)
			} else {
				// using global:
				// request exact page from database and do no filtering
				rows = await utils.sql.all(`SELECT bank_access.user_id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id WHERE bank_accounts.type = 0 ORDER BY bank_accounts.amount DESC LIMIT ${itemsPerPage} OFFSET ${offset}`)
				availableRowCount = (await utils.sql.get("SELECT COUNT(*) AS count FROM bank_accounts WHERE type = 0")).count
			}

			const lastAvailablePage = Math.min(Math.ceil(availableRowCount / itemsPerPage), maxPages)
			const title = isLocal ? "Local Leaderboard" : "Leaderboard"
			const footerHelp = `${prefixes.main}leaderboard ${lang.gambling.leaderboard.help.usage}`

			if (rows.length) {
				// Load usernames
				const displayRows = await Promise.all(rows.map(async ({ user_id, amount }, index) => {
					const [tag, isBot] = await utils.cacheManager.users.get(user_id, true, true)
						// @ts-ignore
						.then(user => [user.tag, user.bot])
						.catch(() => [user_id, false]) // fall back to userID if user no longer exists
					const botTag = isBot ? emojis.bot : ""
					const ranking = itemsPerPage * (pageNumber - 1) + index + 1
					return `${ranking}. ${tag} ${botTag} :: ${utils.numberComma(amount)} ${emojis.discoin}`
				}))

				// Display results
				const embed = new Discord.MessageEmbed()
					.setAuthor(title)
					.setDescription(displayRows.join("\n"))
					.setFooter(utils.replace(lang.gambling.leaderboard.prompts.pageCurrent, { "current": pageNumber, "total": lastAvailablePage }) + ` | ${footerHelp}`) // SC: U+2002 EN SPACE
					.setColor(constants.money_embed_color)
				return msg.channel.send(await utils.contentify(msg.channel, embed))
			} else return msg.channel.send(utils.replace(lang.gambling.leaderboard.prompts.pageLimit, { "username": msg.author.username, "maxPages": lastAvailablePage }))
		}
	},
	{
		usage: "<amount: number|all|half> <user>",
		description: "Gives discoins to a user from your account",
		aliases: ["give"],
		category: "gambling",
		examples: ["give half PapiOphidian"],
		async process(msg, suffix, lang) {
			if (msg.channel.type === "dm") return msg.channel.send(utils.replace(lang.gambling.give.prompts.guildOnly, { "username": msg.author.username }))
			const args = suffix.split(" ")
			if (!args[0]) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidAmountandUser, { "username": msg.author.username }))
			const usertxt = suffix.slice(args[0].length + 1)
			if (!usertxt) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidUser, { "username": msg.author.username }))
			const member = await utils.cacheManager.members.find(msg, usertxt)
			if (!member) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidUser, { "username": msg.author.username }))
			if (member.id == msg.author.id) return msg.channel.send(lang.gambling.give.prompts.cannotGiveSelf)
			const [authorCoins, memsettings, guildsettings] = await Promise.all([
				utils.coinsManager.get(msg.author.id),
				utils.sql.get("SELECT * FROM settings_self WHERE key_id = $1 AND setting = $2", [member.id, "gamblingalert"]),
				utils.sql.get("SELECT * FROM settings_guild WHERE key_id = $1 AND setting = $2", [msg.guild.id, "gamblingalert"])
			])
			let gift
			if (args[0] == "all" || args[0] == "half") {
				if (authorCoins <= BigInt(0)) return msg.channel.send(utils.replace(lang.gambling.give.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (args[0] === "all") {
					gift = authorCoins
				} else {
					gift = authorCoins / BigInt(2)
				}
			} else {
				gift = utils.parseBigInt(args[0])
				if (!gift) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidGift, { "username": msg.author.username }))
				if (gift < 1) return msg.channel.send(utils.replace(lang.gambling.give.prompts.giftSmall, { "username": msg.author.username }))
				if (gift > authorCoins) return msg.channel.send(utils.replace(lang.gambling.give.prompts.moneyInsufficient, { "username": msg.author.username }))
			}
			utils.coinsManager.transact(msg.author.id, member.id, gift)
			const memlang = await utils.getLang(member.id, "self")
			const embed = new Discord.MessageEmbed()
				.setDescription(utils.replace(lang.gambling.give.returns.channel, { "mention1": String(msg.author), "number": utils.numberComma(gift), "mention2": String(member) }))
				.setColor(constants.money_embed_color)
			msg.channel.send(await utils.contentify(msg.channel, embed))
			if (memsettings && memsettings.value == 0) return
			if (guildsettings && guildsettings.value == 0) {
				if (memsettings && memsettings.value == 1) return member.send(utils.replace(memlang.gambling.give.returns.dm, { "mention": String(msg.author), "number": utils.numberComma(gift) })).catch(() => msg.channel.send(lang.gambling.give.prompts.dmFailed))
				else return
			}
			return member.send(utils.replace(memlang.gambling.give.returns.dm, { "mention": String(msg.author), "number": utils.numberComma(gift) })).catch(() => msg.channel.send(lang.gambling.give.prompts.dmFailed))
		}
	},
	{
		usage: "[amount: number|all|half]",
		description: "A Wheel of Fortune for a chance at making more Discoins",
		aliases: ["wheel", "wof"],
		category: "gambling",
		examples: ["wheel 1000"],
		async process(msg, suffix, lang) {
			if (msg.channel.type === "dm") return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.guildOnly, { "username": msg.author.username }))
			if (!(await utils.cacheManager.channels.clientHasPermission({ id: msg.channel.id, guild_id: msg.guild.id }, "ATTACH_FILES"))) return msg.channel.send(lang.gambling.wheel.prompts.permissionDenied)
			await msg.channel.sendTyping()
			const [money, canv, triangle] = await Promise.all([
				utils.coinsManager.get(msg.author.id),
				utils.jimpStores.images.get("wheel-canvas"),
				utils.jimpStores.images.get("emoji-triangle")
			])

			if (!suffix) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.invalidAmountWheel, { "username": msg.author.username }))
			let amount
			if (suffix == "all" || suffix == "half") {
				if (money === BigInt(0)) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (suffix == "all") {
					amount = money
				} else {
					amount = money / BigInt(2)
				}
			} else {
				amount = utils.parseBigInt(suffix)
				if (!amount) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.invalidAmount, { "username": msg.author.username }))
				if (amount < 2) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.betSmall, { "username": msg.author.username }))
				if (amount > money) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.moneyInsufficient, { "username": msg.author.username }))
			}

			const choices = ["0", "0", "0", "0", "2", "0", "0", "5"]
			const choice = utils.arrayRandom(choices)
			let coords
			if (choice == choices[0]) coords = [-125, 185, 230]
			else if (choice == choices[1]) coords = [-50, 185, 200]
			else if (choice == choices[2]) coords = [-80, 210, 250]
			else if (choice == choices[3]) coords = [80, 230, 250]
			else if (choice == choices[4]) coords = [8, 253, 233]
			else if (choice == choices[5]) coords = [14, 208, 187]
			else if (choice == choices[6]) coords = [-18, 230, 187]
			else if (choice == choices[7]) coords = [50, 245, 200]

			const canvas = canv.clone()
			const arrow = triangle.clone().resize(50, 50, Jimp.RESIZE_NEAREST_NEIGHBOR)

			const [rotation, x, y] = coords

			arrow.rotate(rotation)
			/**
			 * we previously passed a blend mode as a string but it only accepts an object
			 * of type { mode: string, opacitySource: number, opacityDest: number } so it did not actually blend
			 * with the passed mode previously. It'd be best to just not specify a mode unless you know what you're doing.
			 */
			canvas.composite(arrow, x, y)

			const buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			const image = new Discord.MessageAttachment(buffer, "wheel.png")
			const award = (Number(choice) > 1.0 && ["all", "half"].includes(suffix)) ? amount * (BigInt(choice) + BigInt(2)) : (amount * BigInt(choice)) - amount
			await utils.coinsManager.award(msg.author.id, award, `Wheel Of ${award <= BigInt(0) ? "Misf" : "F"}ortune`)
			return msg.channel.send({ content: utils.replace(lang.gambling.wheel.returns.winnings, { "tag": msg.author.tag, "number1": utils.numberComma(amount), "number2": award <= BigInt(0) ? 0 : utils.numberComma(award - amount) }), files: [image] })
		}
	}
])
