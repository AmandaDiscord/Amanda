// @ts-check

const Jimp = require("jimp")
const Discord = require("thunderstorm")

const emojis = require("../emojis")

const passthrough = require("../passthrough")
const { constants, client, commands, reloader } = passthrough

const dailyCooldownHours = 20
const dailyCooldownTime = dailyCooldownHours * 60 * 60 * 1000

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

commands.assign([
	{
		usage: "[amount: number|all|half]",
		description: "*slaps top of slot machine.* This baby can make you loose all your amandollars",
		aliases: ["slot", "slots"],
		category: "gambling",
		examples: ["slot 1000"],
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			// @ts-ignore
			if (await utils.cacheManager.channels.typeOf(msg.channel) === "dm") return msg.channel.send(utils.replace(lang.gambling.slot.prompts.guildOnly, { "username": msg.author.username }))
			if (!(await utils.cacheManager.channels.hasPermissions({ id: msg.channel.id, guild_id: msg.guild.id }, 0x00008000))) return msg.channel.send(lang.gambling.slot.prompts.permissionDenied)
			await msg.channel.sendTyping()
			const args = suffix.split(" ")
			const fruits = ["apple", "cherries", "watermelon", "pear", "strawberry"] // plus heart, which is chosen seperately
			const isPremium = await utils.sql.get("SELECT * FROM Premium WHERE userID = ?", msg.author.id)
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
				return msg.channel.send({ file: image })
			}
			let bet
			if (args[0] == "all" || args[0] == "half") {
				if (money == 0) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (args[0] === "all") {
					bet = money
				} else {
					bet = Math.floor(money / 2)
				}
			} else {
				bet = Math.floor(utils.parseNumber(args[0]))
				if (isNaN(bet)) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.invalidBet, { "username": msg.author.username }))
				if (bet < 2) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.betSmall, { "username": msg.author.username }))
				if (bet > money) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.moneyInsufficient, { "username": msg.author.username }))
			}
			let result, winning
			if (slots.every(s => s == "heart")) {
				winning = bet * 20
				result = utils.replace(lang.gambling.slot.returns.heart3, { "number": utils.numberComma(winning) })
			} else if (slots.filter(s => s == "heart").length == 2) {
				winning = bet * 4
				result = utils.replace(lang.gambling.slot.returns.heart2, { "number": utils.numberComma(winning) })
			} else if (slots.filter(s => s == "heart").length == 1) {
				winning = Math.floor(bet * 1.25)
				result = utils.replace(lang.gambling.slot.returns.heart1, { "number": utils.numberComma(winning) })
			} else if (slots.slice(1).every(s => s == slots[0])) {
				winning = bet * 5
				result = utils.replace(lang.gambling.slot.returns.triple, { "number": utils.numberComma(winning) })
			} else {
				winning = 0
				result = utils.replace(lang.gambling.slot.returns.lost, { "number": utils.numberComma(bet) })
			}
			utils.coinsManager.award(msg.author.id, winning - bet)
			buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			image = new Discord.MessageAttachment(buffer, "slot.png")
			return msg.channel.send(result, { file: image })
		}
	},
	{
		usage: "None",
		description: "Flips a coin",
		aliases: ["flip"],
		category: "gambling",
		examples: ["flip"],
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
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
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			// @ts-ignore
			if (await utils.cacheManager.channels.typeOf(msg.channel) === "dm") return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.guildOnly, { "username": msg.author.username }))
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
				if (money == 0) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (args[0] == "all") {
					bet = money
				} else {
					bet = Math.floor(money / 2)
				}
			} else {
				bet = Math.floor(utils.parseNumber(args[0]))
				if (isNaN(bet)) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.invalidBet, { "username": msg.author.username }))
				if (bet < 1) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.betSmall, { "username": msg.author.username }))
				if (bet > money) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.moneyInsufficient, { "username": msg.author.username }))
			}
			let selfChosenSide = false
			if (!args[1]) {
				args[1] = Math.random() < 0.5 ? "h" : "t"
				selfChosenSide = true
			}
			if (args[1] != "h" && args[1] != "t") return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.invalidSide, { "username": msg.author.username }))
			const isPremium = await utils.sql.get("SELECT * FROM Premium WHERE userID =?", msg.author.id)
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
				const winnings = Math.floor(bet * 1.25)
				const explanation = "(+25%)"
				msg.channel.send(
					(!selfChosenSide ? "" : `${lang.gambling.betflip.returns.autoChoose} ${strings[args[1]][0]}\n`) +
					utils.replace(lang.gambling.betflip.returns.guess, { "string1": `${strings[args[1]][0]}.\n${strings[args[1]][1]}`, "string2": `${strings[args[1]][0]}` }) +
					`.\n${utils.replace(lang.gambling.betflip.returns.win, { "number": utils.numberComma(winnings), "explanation": explanation })}`
				)
				utils.coinsManager.award(msg.author.id, winnings)
			} else {
				const pick = args[1] == "h" ? "t" : "h"
				msg.channel.send(
					(!selfChosenSide ? "" : `${lang.gambling.betflip.returns.autoChoose} ${strings[args[1]][0]}\n`) +
					utils.replace(lang.gambling.betflip.returns.guess, { "string1": `${strings[args[1]][0]}.\n${strings[pick][1]}`, "string2": `${strings[pick][0]}` }) +
					`.\n${utils.replace(lang.gambling.betflip.returns.lost, { "number": utils.numberComma(bet) })}`
				)
				return utils.coinsManager.award(msg.author.id, -bet)
			}
		}
	},
	{
		usage: "[user]",
		description: "Returns the amount of Discoins you or another user has",
		aliases: ["coins", "$", "balance", "bal", "discoins", "amandollars"],
		category: "gambling",
		examples: ["coins PapiOphidian"],
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			let user, member
			if (msg.channel.type == "text") {
				member = await utils.cacheManager.members.find(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix, true)
			if (!user) return msg.channel.send(utils.replace(lang.gambling.coins.prompts.invalidUser, { "username": msg.author.username }))
			const money = await utils.coinsManager.getRow(user.id)
			const embed = new Discord.MessageEmbed()
				.setAuthor(utils.replace(lang.gambling.coins.returns.coins, { "display": member ? `${user.tag}${member.nickname ? `(${member.nickname})` : ""}` : user.tag }))
				.setDescription(`${utils.numberComma(money.coins)} ${emojis.discoin}`)
				.addFields([
					{
						name: "Lifetime received amandollars",
						value: utils.numberComma(money.woncoins)
					},
					{
						name: "Lifetime lost amandollars",
						value: utils.numberComma(money.lostcoins)
					},
					{
						name: "Lifetime given amandollars",
						value: utils.numberComma(money.givencoins)
					}
				])
				.setColor(constants.money_embed_color)
			return msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	},
	{
		usage: "None",
		description: "A daily command that gives a random amount of Discoins",
		aliases: ["daily"],
		category: "gambling",
		examples: ["daily"],
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			// @ts-ignore
			if (await utils.cacheManager.channels.typeOf(msg.channel) === "dm") return msg.channel.send(utils.replace(lang.gambling.daily.prompts.guildOnly, { "username": msg.author.username }))
			const [row, donor] = await Promise.all([
				utils.sql.get("SELECT lastClaim FROM DailyCooldown WHERE userID = ?", msg.author.id),
				utils.sql.get("SELECT * FROM Premium WHERE userID =?", msg.author.id)
			])
			if (!row || row.lastClaim + dailyCooldownTime < Date.now()) {
				let amount
				if (donor) amount = Math.floor(Math.random() * (750 - 500) + 500) + 1
				else amount = Math.floor(Math.random() * (500 - 100) + 100) + 1
				const embed = new Discord.MessageEmbed()
					.setDescription(utils.replace(lang.gambling.daily.returns.claimed, { "username": msg.author.username, "number": amount }))
					.setColor(constants.money_embed_color)
				msg.channel.send(await utils.contentify(msg.channel, embed))
				utils.coinsManager.award(msg.author.id, amount)
				utils.sql.all("REPLACE INTO DailyCooldown VALUES (?, ?)", [msg.author.id, Date.now()])
			} else {
				const timeRemaining = utils.shortTime(row.lastClaim - Date.now() + dailyCooldownTime, "ms")
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
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			const maxPages = 20
			const itemsPerPage = 10

			const args = suffix.split(" ")

			// Set up local
			const isLocal = ["local", "guild", "server"].includes(args[0])

			if (isLocal) {
				if (await utils.cacheManager.channels.typeOf(msg.channel) === "dm") return msg.channel.send(utils.replace(lang.gambling.coins.prompts.guildOnly, { "username": msg.author.username }))
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
				const memIDs = await client.rain.cache.member.getIndexMembers(msg.guild.id)
				rows = await utils.sql.all(`SELECT userID, coins FROM money WHERE userID IN (${Array(memIDs.length).fill("?").join(", ")}) ORDER BY coins DESC LIMIT ?`, [...memIDs, maxPages * itemsPerPage])
				availableRowCount = rows.length
				rows = rows.slice(itemsPerPage * (pageNumber - 1), itemsPerPage * pageNumber)
			} else {
				// using global:
				// request exact page from database and do no filtering
				rows = await utils.sql.all("SELECT userID, coins FROM money ORDER BY coins DESC LIMIT ? OFFSET ?", [itemsPerPage, offset])
				availableRowCount = (await utils.sql.get("SELECT count(*) AS count FROM money")).count
			}

			const lastAvailablePage = Math.min(Math.ceil(availableRowCount / itemsPerPage), maxPages)
			const title = isLocal ? "Local Leaderboard" : "Leaderboard"
			const footerHelp = `&leaderboard ${lang.gambling.leaderboard.help.usage}`

			if (rows.length) {
				// Load usernames
				const displayRows = await Promise.all(rows.map(async ({ userID, coins }, index) => {
					const [tag, isBot] = await utils.cacheManager.users.get(userID, true, true)
						// @ts-ignore
						.then(user => [user.tag, user.bot])
						.catch(() => [userID, false]) // fall back to userID if user no longer exists
					const botTag = isBot ? emojis.bot : ""
					const ranking = itemsPerPage * (pageNumber - 1) + index + 1
					return `${ranking}. ${tag} ${botTag} :: ${utils.numberComma(coins)} ${emojis.discoin}`
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
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			// @ts-ignore
			if (await utils.cacheManager.channels.typeOf(msg.channel) === "dm") return msg.channel.send(utils.replace(lang.gambling.give.prompts.guildOnly, { "username": msg.author.username }))
			const args = suffix.split(" ")
			if (!args[0]) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidAmountandUser, { "username": msg.author.username }))
			const usertxt = suffix.slice(args[0].length + 1)
			if (!usertxt) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidUser, { "username": msg.author.username }))
			const member = await utils.cacheManager.members.find(msg, usertxt)
			if (!member) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidUser, { "username": msg.author.username }))
			if (member.id == msg.author.id) return msg.channel.send(lang.gambling.give.prompts.cannotGiveSelf)
			const [authorCoins, memsettings, guildsettings] = await Promise.all([
				utils.coinsManager.get(msg.author.id),
				utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID =? AND setting =?", [member.id, "gamblingalert"]),
				utils.sql.get("SELECT * FROM SettingsGuild WHERE keyID =? AND setting =?", [msg.guild.id, "gamblingalert"])
			])
			let gift
			if (args[0] == "all" || args[0] == "half") {
				if (authorCoins == 0) return msg.channel.send(utils.replace(lang.gambling.give.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (args[0] === "all") {
					gift = authorCoins
				} else {
					gift = Math.floor(authorCoins / 2)
				}
			} else {
				gift = Math.floor(utils.parseNumber(args[0]))
				if (isNaN(gift)) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidGift, { "username": msg.author.username }))
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
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			// @ts-ignore
			if (await utils.cacheManager.channels.typeOf(msg.channel) === "dm") return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.guildOnly, { "username": msg.author.username }))
			if (!(await utils.cacheManager.channels.hasPermissions({ id: msg.channel.id, guild_id: msg.guild.id }, 0x00008000))) return msg.channel.send(lang.gambling.wheel.prompts.permissionDenied)
			await msg.channel.sendTyping()
			const [money, canv, triangle] = await Promise.all([
				utils.coinsManager.get(msg.author.id),
				utils.jimpStores.images.get("wheel-canvas"),
				utils.jimpStores.images.get("emoji-triangle")
			])

			if (!suffix) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.invalidAmountWheel, { "username": msg.author.username }))
			let amount
			if (suffix == "all" || suffix == "half") {
				if (money == 0) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (suffix == "all") {
					amount = money
				} else {
					amount = Math.floor(money / 2)
				}
			} else {
				amount = Math.floor(utils.parseNumber(suffix))
				if (isNaN(amount)) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.invalidAmount, { "username": msg.author.username }))
				if (amount < 2) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.betSmall, { "username": msg.author.username }))
				if (amount > money) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.moneyInsufficient, { "username": msg.author.username }))
			}

			const choices = ["0.1", "0.2", "0.3", "0.5", "1.2", "1.5", "1.7", "2.4"]
			const choice = utils.arrayRandom(choices)
			let coords
			if (choice == "0.1") coords = [-125, 185, 230]
			else if (choice == "0.2") coords = [-50, 185, 200]
			else if (choice == "0.3") coords = [-80, 210, 250]
			else if (choice == "0.5") coords = [80, 230, 250]
			else if (choice == "1.2") coords = [8, 253, 233]
			else if (choice == "1.5") coords = [14, 208, 187]
			else if (choice == "1.7") coords = [-18, 230, 187]
			else if (choice == "2.4") coords = [50, 245, 200]

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
			await utils.coinsManager.award(msg.author.id, Math.round((amount * Number(choice)) - amount))
			return msg.channel.send(utils.replace(lang.gambling.wheel.returns.winnings, { "tag": msg.author.tag, "number1": utils.numberComma(amount), "number2": utils.numberComma(Math.round(amount * Number(choice))) }), { file: image })
		}
	}
])
