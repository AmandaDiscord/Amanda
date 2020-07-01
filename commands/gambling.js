// @ts-check

const Jimp = require("jimp")
const JimpProto = Jimp.prototype
const Discord = require("discord.js")

const emojis = require("../modules/emojis")

const passthrough = require("../passthrough")
const { constants, client, commands, reloader } = passthrough

const dailyCooldownHours = 20
const dailyCooldownTime = dailyCooldownHours * 60 * 60 * 1000

const utils = require("../modules/utilities.js")
reloader.sync("./modules/utilities.js", utils)
const JIMPStorage = utils.JIMPStorage

/** @type {JIMPStorage<typeof JimpProto>} */
const imageStorage = new utils.JIMPStorage()
/** @type {JIMPStorage<import("@jimp/plugin-print").Font>} */
const fontStorage = new utils.JIMPStorage()
imageStorage.save("slot-background", "file", "./images/backgrounds/commands/slot.png")
imageStorage.save("slot-amanda", "file", "./images/overlays/slot-amanda-carsaleswoman.png")
imageStorage.save("slot-machine", "file", "./images/overlays/slot-machine.png")
imageStorage.save("slot-top", "file", "./images/overlays/slot-top-layer.png")

imageStorage.save("emoji-apple", "file", "./images/emojis/apple.png")
imageStorage.save("emoji-cherries", "file", "./images/emojis/cherries.png")
imageStorage.save("emoji-heart", "file", "./images/emojis/heart.png")
imageStorage.save("emoji-pear", "file", "./images/emojis/pear.png")
imageStorage.save("emoji-strawberry", "file", "./images/emojis/strawberry.png")
imageStorage.save("emoji-watermelon", "file", "./images/emojis/watermelon.png")
imageStorage.save("emoji-triangle", "file", "./images/emojis/triangle.png")

imageStorage.save("wheel-canvas", "file", "./images/backgrounds/commands/wheel.png");

["apple", "cherries", "heart", "pear", "strawberry", "watermelon"].forEach(i => imageStorage.get(`emoji-${i}`).then(image => image.resize(85, 85)))
imageStorage.get("emoji-triangle").then(image => image.resize(50, 50, Jimp.RESIZE_NEAREST_NEIGHBOR))

fontStorage.save("font", "font", ".fonts/Whitney-20.fnt")

commands.assign([
	{
		usage: "[amount: number|all|half]",
		description: "*slaps top of slot machine.* This baby can make you loose all your amandollars",
		aliases: ["slot", "slots"],
		category: "gambling",
		example: "&slot 1000",
		async process(msg, suffix, lang) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.guildOnly, { "username": msg.author.username }))
			let permissions
			if (msg.channel instanceof Discord.TextChannel) permissions = msg.channel.permissionsFor(client.user)
			if (permissions && !permissions.has("ATTACH_FILES")) return msg.channel.send(lang.gambling.slot.prompts.permissionDenied)
			msg.channel.sendTyping()
			const args = suffix.split(" ")
			const array = ["apple", "cherries", "watermelon", "pear", "strawberry"] // plus heart, which is chosen seperately
			const cooldownInfo = {
				max: 23,
				min: 10,
				step: 1,
				regen: {
					amount: 1,
					time: 3 * 60 * 1000
				}
			}
			const [money, winChance, images] = await Promise.all([
				utils.coinsManager.get(msg.author.id),
				utils.cooldownManager(msg.author.id, "slot", cooldownInfo),
				imageStorage.getAll(["slot-background", "slot-amanda", "slot-machine", "slot-top", "emoji-apple", "emoji-cherries", "emoji-heart", "emoji-pear", "emoji-strawberry", "emoji-watermelon", "font"])
			])
			const slots = []
			for (let i = 0; i < 3; i++) {
				if (Math.random() < winChance / 100) slots[i] = "heart"
				else slots[i] = utils.arrayRandom(array)
			}

			const canvas = images.get("slot-background").clone()
			canvas.composite(images.get("slot-amanda").clone(), 0, 0)
			canvas.composite(images.get("slot-machine").clone(), 0, 0)
			const pieces = []
			slots.forEach(i => pieces.push(images.get(`emoji-${i}`)))

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
				if (money == 0) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (args[0] === "all") {
					bet = money
				} else {
					bet = Math.floor(money / 2)
				}
			} else {
				bet = Math.floor(Number(args[0]))
				if (isNaN(bet)) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.invalidBet, { "username": msg.author.username }))
				if (bet < 2) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.betSmall, { "username": msg.author.username }))
				if (bet > money) return msg.channel.send(utils.replace(lang.gambling.slot.prompts.moneyInsufficient, { "username": msg.author.username }))
			}
			let result, winning
			if (slots.every(s => s == "heart")) {
				winning = bet * 30
				result = utils.replace(lang.gambling.slot.returns.heart3, { "number": bet * 30 })
			} else if (slots.filter(s => s == "heart").length == 2) {
				winning = bet * 4
				result = utils.replace(lang.gambling.slot.returns.heart2, { "number": bet * 4 })
			} else if (slots.filter(s => s == "heart").length == 1) {
				winning = Math.floor(bet * 1.25)
				result = utils.replace(lang.gambling.slot.returns.heart1, { "number": Math.floor(bet * 1.25) })
			} else if (slots.slice(1).every(s => s == slots[0])) {
				winning = bet * 10
				result = utils.replace(lang.gambling.slot.returns.triple, { "number": bet * 10 })
			} else {
				winning = 0
				result = utils.replace(lang.gambling.slot.returns.lost, { "number": bet })
			}
			utils.coinsManager.award(msg.author.id, winning - bet)
			buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			image = new Discord.MessageAttachment(buffer, "slot.png")
			return msg.channel.send(result, { files: [image] })
		}
	},
	{
		usage: "None",
		description: "Flips a coin",
		aliases: ["flip"],
		category: "gambling",
		example: "&flip",
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
		example: "&bf 1000 h",
		async process(msg, suffix, lang) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(utils.replace(lang.gambling.betflip.prompts.guildOnly, { "username": msg.author.username }))
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
				bet = Math.floor(Number(args[0]))
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
			const cooldownInfo = {
				max: 60,
				min: 36,
				step: 3,
				regen: {
					amount: 1,
					time: 60 * 1000
				}
			}
			const winChance = await utils.cooldownManager(msg.author.id, "bf", cooldownInfo)
			const strings = {
				h: ["heads", "<:coinH:402219464348925954>"],
				t: ["tails", "<:coinT:402219471693021196>"]
			}
			if (Math.random() < winChance / 100) {
				msg.channel.send(
					(!selfChosenSide ? "" : `${lang.gambling.betflip.returns.autoChoose} ${strings[args[1]][0]}\n`) +
					utils.replace(lang.gambling.betflip.returns.guess, { "string1": `${strings[args[1]][0]}.\n${strings[args[1]][1]}`, "string2": `${strings[args[1]][0]}` }) +
					`.\n${utils.replace(lang.gambling.betflip.returns.win, { "number": bet * 2 })}`
				)
				utils.coinsManager.award(msg.author.id, bet)
			} else {
				const pick = args[1] == "h" ? "t" : "h"
				msg.channel.send(
					(!selfChosenSide ? "" : `${lang.gambling.betflip.returns.autoChoose} ${strings[args[1]][0]}\n`) +
					utils.replace(lang.gambling.betflip.returns.guess, { "string1": `${strings[args[1]][0]}.\n${strings[pick][1]}`, "string2": `${strings[pick][0]}` }) +
					`.\n${lang.gambling.betflip.returns.lost}`
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
		example: "&coins PapiOphidian",
		async process(msg, suffix, lang) {
			let user, member
			if (msg.channel.type == "text") {
				member = await msg.guild.findMember(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.findUser(msg, suffix, true)
			if (!user) return msg.channel.send(utils.replace(lang.gambling.coins.prompts.invalidUser, { "username": msg.author.username }))
			const money = await utils.coinsManager.get(user.id)
			const embed = new Discord.MessageEmbed()
				.setAuthor(utils.replace(lang.gambling.coins.returns.coins, { "display": member ? member.displayTag : user.tag }))
				.setDescription(`${money} ${emojis.discoin}`)
				.setColor(constants.money_embed_color)
			return msg.channel.send(utils.contentify(msg.channel, embed))
		}
	},
	{
		usage: "None",
		description: "A daily command that gives a random amount of Discoins",
		aliases: ["daily"],
		category: "gambling",
		example: "&daily",
		async process(msg, suffix, lang) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(utils.replace(lang.gambling.daily.prompts.guildOnly, { "username": msg.author.username }))
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
				msg.channel.send(utils.contentify(msg.channel, embed))
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
		example: "&lb 2",
		async process(msg, suffix, lang) {
			const maxPages = 20
			const itemsPerPage = 10
			let isLargeGuild = false

			const args = suffix.split(" ")

			// Set up local
			const inputLocalArg = args[0]
			const isLocal = ["local", "guild", "server"].includes(args[0])
			if (isLocal) {
				if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(utils.replace(lang.gambling.coins.prompts.guildOnly, { "username": msg.author.username }))
				args.shift() // if it exists, page number will now definitely be in args[0]
				isLargeGuild = msg.guild.members.cache.size >= 1000 // members for a "large guild". read further down
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
			if (isLocal && !isLargeGuild) {
				// using small guild method:
				// request rows for everyone in the guild
				const memberIDs = [...msg.guild.members.cache.keys()] // cache so it doesn't change during sql execution
				rows = await utils.sql.all(`SELECT userID, coins FROM money WHERE userID IN (${Array(memberIDs.length).fill("?").join(", ")}) ORDER BY coins DESC LIMIT ? OFFSET ?`, [...memberIDs, itemsPerPage, offset])
				availableRowCount = (await utils.sql.get(`SELECT count(*) AS count FROM money WHERE userID IN (${Array(memberIDs.length).fill("?").join(", ")})`, memberIDs)).count
			} else if (isLocal) {
				// using large guild method:
				// request top pages from database then filter to guild members then slice to page
				rows = await utils.sql.all("SELECT userID, coins FROM money ORDER BY coins DESC LIMIT ?", [maxPages * itemsPerPage])
				rows = rows.filter(row => msg.guild.members.cache.has(row.userID))
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
					const [tag, isBot] = await client.users.fetch(userID, false) // don't cache. let's not waste memory on something we probably won't need again.
						.then(user => [user.tag, user.bot])
						.catch(() => [userID, false]) // fall back to userID if user no longer exists
					const botTag = isBot ? emojis.bot : ""
					const ranking = itemsPerPage * (pageNumber - 1) + index + 1
					return `${ranking}. ${tag} ${botTag} :: ${coins} ${emojis.discoin}`
				}))

				// Display results
				const embed = new Discord.MessageEmbed()
					.setAuthor(title)
					.setDescription(displayRows.join("\n"))
					.setFooter(utils.replace(lang.gambling.leaderboard.prompts.pageCurrent, { "current": pageNumber, "total": lastAvailablePage }) + ` | ${footerHelp}`) // SC: U+2002 EN SPACE
					.setColor(constants.money_embed_color)
				return msg.channel.send(utils.contentify(msg.channel, embed))
			} else return msg.channel.send(utils.replace(lang.gambling.leaderboard.prompts.pageLimit, { "username": msg.author.username, "maxPages": lastAvailablePage }))
		}
	},
	{
		usage: "<amount: number|all|half> <user>",
		description: "Gives discoins to a user from your account",
		aliases: ["give"],
		category: "gambling",
		example: "&give half PapiOphidian",
		async process(msg, suffix, lang) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(utils.replace(lang.gambling.give.prompts.guildOnly, { "username": msg.author.username }))
			const args = suffix.split(" ")
			if (!args[0]) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidAmountandUser, { "username": msg.author.username }))
			const usertxt = suffix.slice(args[0].length + 1)
			if (!usertxt) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidUser, { "username": msg.author.username }))
			const member = await msg.guild.findMember(msg, usertxt)
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
				gift = Math.floor(Number(args[0]))
				if (isNaN(gift)) return msg.channel.send(utils.replace(lang.gambling.give.prompts.invalidGift, { "username": msg.author.username }))
				if (gift < 1) return msg.channel.send(utils.replace(lang.gambling.give.prompts.giftSmall, { "username": msg.author.username }))
				if (gift > authorCoins) return msg.channel.send(utils.replace(lang.gambling.give.prompts.moneyInsufficient, { "username": msg.author.username }))
			}
			utils.coinsManager.transact(msg.author.id, member.id, gift)
			const memlang = await utils.getLang(member.id, "self")
			const embed = new Discord.MessageEmbed()
				.setDescription(utils.replace(lang.gambling.give.returns.channel, { "mention1": String(msg.author), "number": gift, "mention2": String(member) }))
				.setColor(constants.money_embed_color)
			msg.channel.send(utils.contentify(msg.channel, embed))
			if (memsettings && memsettings.value == 0) return
			if (guildsettings && guildsettings.value == 0) {
				if (memsettings && memsettings.value == 1) return member.send(utils.replace(memlang.gambling.give.returns.dm, { "mention": String(msg.author), "number": gift })).catch(() => msg.channel.send(lang.gambling.give.prompts.dmFailed))
				else return
			}
			return member.send(utils.replace(memlang.gambling.give.returns.dm, { "mention": String(msg.author), "number": gift })).catch(() => msg.channel.send(lang.gambling.give.prompts.dmFailed))
		}
	},
	{
		usage: "[amount: number|all|half]",
		description: "A Wheel of Fortune for a chance at making more Discoins",
		aliases: ["wheel", "wof"],
		category: "gambling",
		example: "&wheel 1000",
		async process(msg, suffix, lang) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send(utils.replace(lang.gambling.wheel.prompts.guildOnly, { "username": msg.author.username }))
			const permissions = msg.channel.permissionsFor(client.user)
			if (permissions && !permissions.has("ATTACH_FILES")) return msg.channel.send(lang.gambling.wheel.prompts.permissionDenied)
			msg.channel.sendTyping()
			const [money, canv, triangle] = await Promise.all([
				utils.coinsManager.get(msg.author.id),
				imageStorage.get("wheel-canvas"),
				imageStorage.get("emoji-triangle")
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
				amount = Math.floor(Number(suffix))
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
			const arrow = triangle.clone()

			const [rotation, x, y] = coords

			arrow.rotate(rotation)
			// @ts-ignore
			canvas.composite(arrow, x, y, Jimp.BLEND_MULTIPLY)

			const buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			const image = new Discord.MessageAttachment(buffer, "wheel.png")
			await utils.coinsManager.award(msg.author.id, Math.round((amount * Number(choice)) - amount))
			utils.replace(lang.gambling.wheel.returns.winnings, { "tag": msg.author.tag, "number1": amount, "number2": Math.round(amount * Number(choice)) })
			return msg.channel.send(utils.replace(lang.gambling.wheel.returns.winnings, { "tag": msg.author.tag, "number1": amount, "number2": Math.round(amount * Number(choice)) }), { files: [image] })
		}
	}
])
