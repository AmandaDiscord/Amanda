// @ts-check

/** @type {import("jimp").default} */
// @ts-ignore
const Jimp = require("jimp")
const crypto = require("crypto")
const rp = require("request-promise")
const Discord = require("discord.js")

const emojis = require("../modules/emojis")

const passthrough = require("../passthrough")
const { client, commands, reloader } = passthrough

const responses = ["That's not strange at all...", "W-What? Why?", "I find it strange that you tried to do that...", "Ok then...", "Come on... Don't make yourself look like an idiot...", "Why even try?", "Oh...", "You are so weird...", "<:NotLikeCat:411364955493761044>"]

const utils = require("../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

/**
 * @type {Object.<string, import("../modules/managers/datastores/CommandStore").Command>}
 */
const cmds = {
	"ship": {
		usage: "<user 1> <user 2>",
		description: "Ships two people",
		aliases: ["ship"],
		category: "interaction",
		process: async function(msg, suffix, lang) {
			if (msg.channel.type == "dm") return msg.channel.send(utils.replace(lang.interaction.ship.prompts.guildOnly, { "username": msg.author.username }))
			let permissions
			if (msg.channel instanceof Discord.TextChannel) permissions = msg.channel.permissionsFor(client.user)
			if (permissions && !permissions.has("ATTACH_FILES")) return msg.channel.send(lang.interaction.ship.prompts.permissionDenied)
			suffix = suffix.replace(/ +/g, " ")
			const args = suffix.split(" ")
			if (args.length != 2) return msg.channel.send(utils.replace(lang.interaction.ship.prompts.invalidUsers, { "username": msg.author.username }))
			const mem1 = await msg.guild.findMember(msg, args[0])
			const mem2 = await msg.guild.findMember(msg, args[1])
			if (mem1 == null) return msg.channel.send(utils.replace(lang.interaction.ship.prompts.invalidUser1, { "username": msg.author.username }))
			if (mem2 == null) return msg.channel.send(utils.replace(lang.interaction.ship.prompts.invalidUser2, { "username": msg.author.username }))
			if (mem1.id == mem2.id) return msg.channel.send(utils.replace(lang.interaction.ship.prompts.selfShip, { "username": msg.author.username }))
			msg.channel.sendTyping()
			const canvas = await Jimp.read("./images/transparent/300x100.png")
			// @ts-ignore
			const pfp1 = await Jimp.read({ url: mem1.user.displayAvatarURL({ format: "png" }) })
			// @ts-ignore
			const pfp2 = await Jimp.read({ url: mem2.user.displayAvatarURL({ format: "png" }) })
			const heart = await Jimp.read("./images/emojis/heart.png")

			await pfp1.resize(100, 100)
			await pfp2.resize(100, 100)
			await heart.resize(80, 80)

			await canvas.composite(pfp1, 0, 0)
			await canvas.composite(heart, 110, 10)
			await canvas.composite(pfp2, 200, 0)

			const buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			const image = new Discord.MessageAttachment(buffer, `ship_${mem1.user.username}_${mem2.user.username}`.replace(/[^a-zA-Z0-9_-]+/g, "") + ".png")
			const strings = [mem1.id, mem2.id].sort((a, b) => parseInt(a) - parseInt(b)).join(" ")
			let percentage = undefined

			/* Custom Percentages */
			if (strings == "320067006521147393 405208699313848330") percentage = 100
			else if (strings == "158750488563679232 185938944460980224") percentage = 99999999999
			else if (strings == "439373663905513473 458823707175944194") percentage = 88888
			else if (strings == "270993297114267649 320067006521147393") percentage = 100
			else if (strings == "312450203678539787 501820319481200650") percentage = 9999
			else {
				const hash = crypto.createHash("sha256").update(strings).digest("hex").slice(0, 6)
				percentage = parseInt("0x" + hash) % 101
			}
			return msg.channel.send(utils.replace(lang.interaction.ship.returns.rating, { "display1": mem1.displayTag, "display2": mem2.displayTag, "percentage": percentage }), { files: [image] })
		}
	},
	"waifu": {
		usage: "[user]",
		description: "Gets the waifu information about yourself or a user",
		aliases: ["waifu"],
		category: "interaction",
		process: async function(msg, suffix, lang) {
			if (msg.channel.type == "dm") return msg.channel.send(utils.replace(lang.interaction.waifu.prompts.guildOnly, { "username": msg.author.username }))
			const member = await msg.guild.findMember(msg, suffix, true)
			if (!member) return msg.channel.send(utils.replace(lang.interaction.waifu.prompts.invalidUser, { "username": msg.author.username }))
			const info = await utils.waifu.get(member.id)
			const embed = new Discord.MessageEmbed()
				.setAuthor(member.displayTag, member.user.avatarURL({ format: "png", size: 32 }))
				.addField("Price:", info.price)
				.addField("Claimed by:", info.claimer ? info.claimer.tag : "(nobody)")
				.addField("Waifu:", info.waifu ? info.waifu.tag : "(nobody)")
				.addField("Gifts:", info.gifts.received.emojis || "(none)")
				.setColor("36393E")
			return msg.channel.send(utils.contentify(msg.channel, embed))
		}
	},
	"claim": {
		usage: "<amount: number|all|half> <user>",
		description: "Claims someone as a waifu. Requires Discoins",
		aliases: ["claim"],
		category: "interaction",
		process: async function(msg, suffix, lang) {
			if (msg.channel.type == "dm") return msg.channel.send(utils.replace(lang.interaction.claim.prompts.guildOnly, { "username": msg.author.username }))
			const args = suffix.split(" ")
			const usertxt = args.slice(1).join(" ")
			if (args[0] == undefined || isNaN(parseInt(args[0]))) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.badFormat, { "username": msg.author.username }))
			if (!usertxt) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.invalidUser, { "username": msg.author.username }))
			const member = await msg.guild.findMember(msg, usertxt)
			if (!member) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.invalidUser, { "username": msg.author.username }))
			if (member.id == msg.author.id) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.selfClaim, { "username": msg.author.username }))
			const [memberInfo, money, memsettings, guildsettings] = await Promise.all([
				utils.waifu.get(member.user.id),
				utils.coinsManager.get(msg.author.id),
				utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID =? AND setting =?", [member.id, "waifualert"]),
				utils.sql.get("SELECT * FROM SettingsGuild WHERE keyID =? AND setting =?", [msg.guild.id, "waifualert"])
			])
			let claim = 0
			if (args[0] == "all" || args[0] == "half") {
				if (!money) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.moneyInsufficient, { "username": msg.author.username }))
				args[0] == "all"
					? claim = money
					: claim = Math.floor(money / 2)
			} else {
				claim = Math.floor(Number(args[0]))
				if (isNaN(claim)) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.moneyInsufficient, { "username": msg.author.username }))
				if (claim < 1) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.claimSmall, { "username": msg.author.username }))
				if (claim > money) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.moneyInsufficient, { "username": msg.author.username }))
			}
			if (memberInfo.price >= claim) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.claimedByOther, { "username": msg.author.username, "number": memberInfo.price + 1 }))
			if (memberInfo.claimer && memberInfo.claimer.id == msg.author.id) return msg.channel.send(utils.replace(lang.interaction.claim.prompts.doubleClaim, { "username": msg.author.username }))
			await utils.waifu.bind(msg.author.id, member.id, claim)
			const faces = ["°˖✧◝(⁰▿⁰)◜✧˖°", "(⋈◍＞◡＜◍)。✧♡", "♡〜٩( ╹▿╹ )۶〜♡", "( ´͈ ॢꇴ `͈ॢ)･*♡", "❤⃛῍̻̩✧(´͈ ૢᐜ `͈ૢ)"]
			const face = utils.arrayRandom(faces)
			const embed = new Discord.MessageEmbed()
				.setDescription(utils.replace(lang.interaction.claim.returns.claimed, { "mention1": String(msg.author), "mention2": String(member), "number": claim }))
				.setColor("36393E")
			msg.channel.send(utils.contentify(msg.channel, embed))
			if (memsettings && memsettings.value == 0) return
			if (guildsettings && guildsettings.value == 0) {
				if (memsettings && memsettings.value == 1) return member.send(`${utils.replace(lang.interaction.claim.returns.dm, { "mention": String(msg.author), "number": claim })} ${face}`).catch(() => msg.channel.send(lang.interaction.claim.prompts.dmFailed))
				else return
			}
			return member.send(`${utils.replace(lang.interaction.claim.returns.dm, { "mention": String(msg.author), "number": claim })} ${face}`).catch(() => msg.channel.send(lang.interaction.claim.prompts.dmFailed))
		}
	},
	"divorce": {
		usage: "[reason]",
		description: "Divorces a user",
		aliases: ["divorce"],
		category: "interaction",
		process: async function(msg, suffix) {
			const info = await utils.waifu.get(msg.author.id)
			if (!info.waifu) return msg.channel.send(`${msg.author.username}, you don't even have a waifu to divorce, silly`)
			const faces = ["( ≧Д≦)", "●︿●", "(  ❛︵❛.)", "╥﹏╥", "(っ◞‸◟c)"]
			const face = utils.arrayRandom(faces)
			await utils.waifu.unbind(msg.author.id)
			msg.channel.send(`${msg.author.tag} has filed for a divorce from ${info.waifu.tag} with ${suffix ? `reason: ${suffix}` : "no reason specified"}`)
			const memsettings = await utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID =? AND setting =?", [info.waifu.id, "waifualert"])
			let guildsettings
			if (msg.guild) guildsettings = await utils.sql.get("SELECT * FROM SettingsGuild WHERE keyID =? AND setting =?", [msg.guild.id, "waifualert"])
			if (memsettings && memsettings.value == 0) return
			if (guildsettings && guildsettings.value == 0) {
				if (memsettings && memsettings.value == 1) return info.waifu.send(`${msg.author.tag} has filed for a divorce from you with ${suffix ? `reason: ${suffix}` : "no reason specified"} ${face}`).catch(() => msg.channel.send(`I tried to DM ${info.waifu.tag} about the divorce but they may have DMs disabled from me`))
				else return
			}
			return info.waifu.send(`${msg.author.tag} has filed for a divorce from you with ${suffix ? `reason: ${suffix}` : "no reason specified"} ${face}`).catch(() => msg.channel.send(`I tried to DM ${info.waifu.tag} about the divorce but they may have DMs disabled from me`))
		}
	},
	"gift": {
		usage: "<amount: number|all|half>",
		description: "Gifts an amount of Discoins towards your waifu's price",
		aliases: ["gift"],
		category: "interaction",
		process: async function(msg, suffix, lang) {
			if (msg.channel.type == "dm") return msg.channel.send(utils.replace(lang.interaction.gift.prompts.guildOnly, { "username": msg.author.username }))
			const args = suffix.split(" ")
			const waifu = await utils.waifu.get(msg.author.id, { basic: true })
			const money = await utils.coinsManager.get(msg.author.id)
			if (!waifu || !waifu.waifuID) return msg.channel.send(`${msg.author.username}, you don't even have a waifu to gift Discoins to, silly`)
			if (!args[0]) return msg.channel.send(`${msg.author.username}, you didn't provide a gift amount`)
			let gift
			if (args[0] == "all" || args[0] == "half") {
				if (money == 0) return msg.channel.send(utils.replace(lang.interaction.gift.prompts.moneyInsufficient, { "username": msg.author.username }))
				args[0] == "all"
					? gift = money
					: gift = Math.floor(money / 2)
			} else {
				gift = Math.floor(Number(args[0]))
				if (isNaN(gift)) return msg.channel.send(utils.replace(lang.interaction.gift.prompts.invalidGift, { "username": msg.author.username }))
				if (gift < 1) return msg.channel.send(utils.replace(lang.interaction.gift.prompts.giftSmall, { "username": msg.author.username }))
				if (gift > money) return msg.channel.send(utils.replace(lang.interaction.gift.prompts.moneyInsufficient, { "username": msg.author.username }))
			}
			await utils.waifu.transact(msg.author.id, gift)
			await utils.coinsManager.award(msg.author.id, -gift)
			const user = await client.users.fetch(waifu.waifuID)
			return msg.channel.send(`${msg.author.username} has gifted ${gift} Discoins towards ${user.tag}'s price`)
		}
	},
	"waifuleaderboard": {
		usage: "[page]",
		description: "Displays the leaderboard of the top waifus",
		aliases: ["waifuleaderboard", "waifulb"],
		category: "interaction",
		process: async function(msg, suffix) {
			let amount = 10
			if (suffix) {
				let num = Number(suffix)
				if (num < 1) num = 1
				if (num > 50) num = 50
				if (isNaN(num)) amount = 10
				else amount = Math.floor(num) * 10
			}
			let all = await utils.sql.all("SELECT * FROM waifu ORDER BY price DESC LIMIT ?", amount)
			if (amount > 10) all = all.slice(amount - 10, amount)
			const users = []
			for (const row of all) for (const key of ["userID", "waifuID"]) if (!users.includes(row[key])) users.push(row[key])
			const userObjectMap = new Map()
			await Promise.all(users.map(async userID => {
				const userObject = await client.users.fetch(userID)
				userObjectMap.set(userID, userObject)
			}))
			const embed = new Discord.MessageEmbed()
				.setTitle("Waifu leaderboard")
				.setDescription(
					all.map((row, index) =>
						`${index + amount - 9}. ${userObjectMap.get(row.userID).tag} claimed ${userObjectMap.get(row.waifuID).tag} for ${row.price} ${emojis.discoin}`
					).join("\n")
				)
				.setFooter(`Page ${amount / 10}`)
				.setColor("F8E71C")
			return msg.channel.send(utils.contentify(msg.channel, embed))
		}
	},
	"bean": {
		usage: "<user>",
		description: "Beans a user",
		aliases: ["bean"],
		category: "interaction",
		process: async function(msg, suffix, lang) {
			if (msg.channel.type !== "text") return msg.channel.send(utils.replace(lang.interaction.bean.prompts.guildOnly, { "username": msg.author.username }))
			if (!suffix) return msg.channel.send(utils.replace(lang.interaction.bean.prompts.invalidUser, { "username": msg.author.username }))
			const member = await msg.guild.findMember(msg, suffix, true)
			if (!member) return msg.channel.send(utils.replace(lang.interaction.bean.prompts.invalidUser, { "username": msg.author.username }))
			if (member.id == client.user.id) return msg.channel.send("No u")
			if (member.id == msg.author.id) return msg.channel.send(utils.replace(lang.interaction.bean.prompts.selfBean, { "username": msg.author.username }))
			return msg.channel.send(utils.replace(lang.interaction.bean.returns.beaned, { "tag": `**${member.user.tag}**` }))
		}
	}
}

const interactionSources = [
	{
		name: "hug", // Command object key and text filler
		description: "Hugs someone", // Command description
		verb: "hugs", // x "verbed" @y in the command response
		shortcut: "nekos.life", // nekos.life: use the command name as the endpoint
		amanda: name => `**Hugs ${name} back** :heart:`, // Response when used on the bot itself
		traaOverride: true // don't set this true for newly added types
	},
	{
		name: "nom",
		description: "Noms someone",
		verb: "nommed",
		shortcut: "durl", // Dynamic URL: call the function "url" and use its response as the GIF URL. Not async.
		url: () => `https://raw.githubusercontent.com/bitsnake/resources/master/Bot/Interactions/nom/nom${Math.floor(Math.random() * (10 - 1) + 1)}.gif`,
		amanda: () => "owie"
	},
	{
		name: "kiss",
		description: "Kisses someone",
		verb: "kissed",
		shortcut: "nekos.life",
		amanda: name => `**Kisses ${name} back** :heart:`,
		traaOverride: true
	},
	{
		name: "cuddle",
		description: "Cuddles someone",
		verb: "cuddles",
		shortcut: "nekos.life",
		amanda: name => `**Cuddles ${name} back** :heart:`,
		traaOverride: true
	},
	{
		name: "poke",
		description: "Pokes someone",
		verb: "poked",
		shortcut: "nekos.life",
		amanda: () => "Don't poke me ; ^ ;"
	},
	{
		name: "slap",
		description: "Slaps someone",
		verb: "slapped",
		shortcut: "nekos.life",
		amanda: name => `**Slaps ${name} back** That hurt me ; ^ ;`
	},
	{
		name: "boop",
		description: "Boops someone",
		verb: "booped",
		shortcut: "durl",
		url: () => `https://raw.githubusercontent.com/bitsnake/resources/master/Bot/Interactions/boop/boop${Math.floor(Math.random() * (10 - 1) + 1)}.gif`,
		amanda: () => "Dun boop me ; ^ ;"
	},
	{
		name: "pat",
		description: "Pats someone",
		verb: "patted",
		shortcut: "nekos.life",
		amanda: () => "≥ w ≤",
		traaOverride: true
	}
]

for (const source of interactionSources) {
	const newCommand = {
		"interaction-command": {
			usage: "<user>",
			description: source.description,
			aliases: [source.name],
			category: "interaction",
			/**
			 * @param {Discord.Message} msg
			 * @param {string} suffix
			 */
			process: (msg, suffix) => doInteraction(msg, suffix, source)
		}
	}
	commands.assign(newCommand)
}

const attempts = [
	(type, g1, g2) => utils.sql.all("select url, GenderGifCharacters.gifid, count(GenderGifCharacters.gifid) as count from GenderGifsV2 inner join GenderGifCharacters on GenderGifsV2.gifid = GenderGifCharacters.gifid where type = ? and (((gender like ? or gender = '*') and importance = 0) or ((gender like ? or gender = '*') and importance = 1)) group by GenderGifCharacters.gifid having count(GenderGifCharacters.gifid) >= 2", [type, g1, g2]),
	(type, g1, g2) => utils.sql.all("select url, GenderGifCharacters.gifid, count(GenderGifCharacters.gifid) as count from GenderGifsV2 inner join GenderGifCharacters on GenderGifsV2.gifid = GenderGifCharacters.gifid where type = ? and (((gender like ? or gender = '*') and importance = 0) or ((gender like ? or gender = '*') and importance = 1)) group by GenderGifCharacters.gifid having count(GenderGifCharacters.gifid) >= 2", [type, g2, g1]),
	(type, g1, g2) => utils.sql.all("select url, GenderGifCharacters.gifid from GenderGifsV2 inner join GenderGifCharacters on GenderGifsV2.gifid = GenderGifCharacters.gifid where type = ? and (gender like ? or gender = '*')", [type, (g2 == "_" ? g1 : g2)])
]

const genderMap = new Map([
	["474711440607936512", "f"],
	["474711506551046155", "m"],
	["474711526247366667", "n"],
	["316829871206563840", "f"],
	["316829948616638465", "m"]
])

/**
 * @param {Discord.Message} msg
 * @param {string} suffix
 * @param {{name: string, description: string, verb: string, shortcut: string, fetch?: () => Promise<string>, amanda: (name: string) => string, footer?: string, traaOverride?: boolean, url?: () => string}} source
 */
async function doInteraction(msg, suffix, source) {
	if (msg.channel.type == "dm") return msg.channel.send(`Why would you want to ${source.name} someone in DMs?`)
	if (!suffix) return msg.channel.send(`You have to tell me who you wanna ${source.name}!`)
	const member = await msg.guild.findMember(msg, suffix)
	if (!member) return msg.channel.send("Invalid user")
	if (member.user.id == msg.author.id) return msg.channel.send(utils.arrayRandom(responses))
	if (member.user.id == client.user.id) return msg.channel.send(source.amanda(msg.author.username))
	let fetch
	if (source.traaOverride) {
		const g1 = msg.member.roles.map(r => genderMap.get(r.id)).find(r => r) || "_"
		const g2 = member.roles.map(r => genderMap.get(r.id)).find(r => r) || "_"
		// console.log(msg.member.user.username, g1, member.user.username, g2)
		if (g1 != "_" || g2 != "_") {
			let found = false
			let i = 0
			while (!found && i < attempts.length) {
				const rows = await attempts[i](source.name, g1, g2)
				if (rows.length) {
					fetch = Promise.resolve(utils.arrayRandom(rows).url)
					found = true
				}
				i++
			}
		}
	}
	if (!fetch) {
		if (source.fetch) fetch = source.fetch()
		if (source.shortcut == "nekos.life") {
			source.footer = "Powered by nekos.life"
			fetch = new Promise((resolve, reject) => {
				rp(`https://nekos.life/api/v2/img/${source.name}`).then(body => {
					const data = JSON.parse(body)
					resolve(data.url)
				}).catch(reject)
			})
		} else if (source.shortcut == "durl") fetch = Promise.resolve(source.url())
		else fetch = Promise.reject(new Error("Shortcut didn't match a function."))
	}
	fetch.then(url => {
		const embed = new Discord.MessageEmbed()
			.setDescription(`${msg.author.username} ${source.verb} <@${member.user.id}>`)
			.setImage(url)
			.setColor("36393E")
		if (source.footer) embed.setFooter(source.footer)
		return msg.channel.send(utils.contentify(msg.channel, embed))
	}).catch(error => { return msg.channel.send("There was an error: ```\n" + error + "```") })
}

commands.assign(cmds)
