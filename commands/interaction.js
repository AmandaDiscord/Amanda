// @ts-check

const Jimp = require("jimp")
const crypto = require("crypto")
const c = require("centra")
const Discord = require("thunderstorm")

const passthrough = require("../passthrough")
const { constants, client, commands, reloader, weeb } = passthrough

const responses = ["That's not strange at all...", "W-What? Why?", "I find it strange that you tried to do that...", "Ok then...", "Come on... Don't make yourself look like an idiot...", "Why even try?", "Oh...", "You are so weird...", "<:NotLikeCat:411364955493761044>"]

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

const cmds = [
	{
		usage: "<user 1> <user 2>",
		description: "Ships two people",
		aliases: ["ship"],
		category: "interaction",
		examples: ["ship PapiOphidian Cadence"],
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			if (await utils.cacheManager.channels.typeOf(msg.channel) === "dm") return msg.channel.send(utils.replace(lang.interaction.ship.prompts.guildOnly, { "username": msg.author.username }))
			if (!(await utils.cacheManager.channels.hasPermissions({ id: msg.channel.id, guild_id: msg.guild.id }, 0x00008000))) return msg.channel.send(lang.interaction.ship.prompts.permissionDenied)
			suffix = suffix.replace(/ +/g, " ")
			const args = suffix.split(" ")
			if (!args.length) return msg.channel.send(utils.replace(lang.interaction.ship.prompts.invalidUsers, { "username": msg.author.username }))
			let mem1, mem2
			if (args.length == 1) {
				mem1 = msg.member
				mem2 = await utils.cacheManager.members.find(msg, args[0])
			} else {
				mem1 = await utils.cacheManager.members.find(msg, args[0])
				mem2 = await utils.cacheManager.members.find(msg, args[1])
			}
			if (mem1 == null) return msg.channel.send(utils.replace(lang.interaction.ship.prompts.invalidUser1, { "username": msg.author.username }))
			if (mem2 == null) return msg.channel.send(utils.replace(lang.interaction.ship.prompts.invalidUser2, { "username": msg.author.username }))
			if (mem1.id == mem2.id) return msg.channel.send(utils.replace(lang.interaction.ship.prompts.selfShip, { "username": msg.author.username }))
			await msg.channel.sendTyping()
			const canvas = new Jimp(300, 100)
			const [pfp1, pfp2, heart] = await Promise.all([
				Jimp.read(mem1.user.displayAvatarURL({ format: "png" })),
				Jimp.read(mem2.user.displayAvatarURL({ format: "png" })),
				Jimp.read("./images/emojis/heart.png")
			])

			pfp1.resize(100, 100)
			pfp2.resize(100, 100)
			heart.resize(80, 80)

			canvas.composite(pfp1, 0, 0)
			canvas.composite(heart, 110, 10)
			canvas.composite(pfp2, 200, 0)

			const buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			const image = new Discord.MessageAttachment(buffer, `${`ship_${mem1.user.username}_${mem2.user.username}`.replace(/[^a-zA-Z0-9_-]+/g, "")}.png`)
			const strings = [mem1.id, mem2.id].sort((a, b) => Number(a) - Number(b)).join(" ")
			let percentage = undefined

			/* Custom Percentages */
			if (strings == "320067006521147393 405208699313848330") percentage = 100
			else if (strings == "158750488563679232 185938944460980224") percentage = 99999999999
			else if (strings == "439373663905513473 458823707175944194") percentage = 88888
			else if (strings == "270993297114267649 320067006521147393") percentage = 100
			else if (strings == "312450203678539787 501820319481200650") percentage = 9999
			else {
				const hash = crypto.createHash("sha256").update(strings).digest("hex").slice(0, 6)
				percentage = Number(`0x${hash}`) % 101
			}
			return msg.channel.send(utils.replace(lang.interaction.ship.returns.rating, { "display1": mem1.displayTag, "display2": mem2.displayTag, "percentage": percentage }), { file: image })
		}
	},
	{
		usage: "<user>",
		description: "Beans a user",
		aliases: ["bean"],
		category: "interaction",
		examples: ["bean PapiOphidian"],
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		async process(msg, suffix, lang) {
			if (await utils.cacheManager.channels.typeOf(msg.channel) === "dm") return msg.channel.send(utils.replace(lang.interaction.bean.prompts.guildOnly, { "username": msg.author.username }))
			if (!suffix) return msg.channel.send(utils.replace(lang.interaction.bean.prompts.invalidUser, { "username": msg.author.username }))
			const member = await utils.cacheManager.members.find(msg, suffix, true)
			if (!member) return msg.channel.send(utils.replace(lang.interaction.bean.prompts.invalidUser, { "username": msg.author.username }))
			if (member.id == client.user.id) return msg.channel.send("No u")
			if (member.id == msg.author.id) return msg.channel.send(utils.replace(lang.interaction.bean.prompts.selfBean, { "username": msg.author.username }))
			return msg.channel.send(utils.replace(lang.interaction.bean.returns.beaned, { "tag": `**${member.user.tag}**` }))
		}
	}
]

const interactionSources = [
	{
		name: "hug", // Command object key and text filler
		description: "Hugs someone", // Command description
		shortcut: "weeb.sh", // nekos.life: use the command name as the endpoint
		traaOverride: true // don't set this true for newly added types
	},
	{
		name: "nom",
		description: "Noms someone",
		shortcut: "weeb.sh"
	},
	{
		name: "kiss",
		description: "Kisses someone",
		shortcut: "weeb.sh",
		traaOverride: true
	},
	{
		name: "cuddle",
		description: "Cuddles someone",
		shortcut: "weeb.sh",
		traaOverride: true
	},
	{
		name: "poke",
		description: "Pokes someone",
		shortcut: "weeb.sh"
	},
	{
		name: "slap",
		description: "Slaps someone",
		shortcut: "weeb.sh"
	},
	{
		name: "boop",
		description: "Boops someone",
		shortcut: "durl",
		url: () => { return getGif("boop") }
	},
	{
		name: "pat",
		description: "Pats someone",
		shortcut: "weeb.sh",
		traaOverride: true
	}
]

for (const source of interactionSources) {
	const newCommand = {
		usage: "<user>",
		description: source.description,
		aliases: [source.name],
		category: "interaction",
		examples: [`${source.name} Amanda`],
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		process: (msg, suffix, lang) => doInteraction(msg, suffix, source, lang)
	}
	cmds.push(newCommand)
}

/**
 * @param {Discord.Message} msg
 * @param {string} suffix
 * @param {{name: string, description: string, shortcut: string, footer?: string, traaOverride?: boolean, url?: () => Promise<string>}} source
 * @param {import("@amanda/lang").Lang} lang
 */
async function doInteraction(msg, suffix, source, lang) {
	if (msg.channel.type == "dm") return msg.channel.send(utils.replace(lang.interaction[source.name].prompts.dm, { "action": source.name }))
	if (!suffix) return msg.channel.send(utils.replace(lang.interaction[source.name].prompts.noUser, { "action": source.name }))
	/** @type {Discord.GuildMember | string} */
	let member = await utils.cacheManager.members.find(msg, suffix)
	if (!member) member = suffix
	let fetched
	if (typeof member != "string") {
		if (member.user.id == msg.author.id) return msg.channel.send(utils.arrayRandom(responses))
		if (member.user.id == client.user.id) return msg.channel.send(utils.replace(lang.interaction[source.name].returns.amanda, { "username": msg.author.username }))
	}
	if (!fetched) {
		if (source.shortcut == "nekos.life") {
			source.footer = "Powered by nekos.life"
			fetched = new Promise((resolve, reject) => {
				c(`https://nekos.life/api/v2/img/${source.name}`).send().then(async body => {
					const data = await body.json()
					resolve(data.url)
				}).catch(reject)
			})
		} else if (source.shortcut == "weeb.sh") {
			source.footer = "Powered by weeb.sh"
			fetched = new Promise((resolve, reject) => {
				// @ts-ignore
				weeb.toph.getRandomImage(source.name, { nsfw: false, fileType: "gif" }).then(data => {
					resolve(data.url)
				})
			})
		} else if (source.shortcut == "durl") fetched = source.url()
		else fetched = Promise.reject(new Error("Shortcut didn't match a function."))
	}
	fetched.then(async url => {
		const embed = new Discord.MessageEmbed()
			.setDescription(utils.replace(lang.interaction[source.name].returns.action, { "username": msg.author.username, "action": source.name, "mention": typeof member == "string" ? member : `<@${member.id}>` }))
			.setImage(url)
			.setColor(constants.standard_embed_color)
		if (source.footer) embed.setFooter(source.footer)
		return msg.channel.send(await utils.contentify(msg.channel, embed))
	}).catch(error => { return msg.channel.send(`There was an error: \`\`\`\n${error}\`\`\``) })
}

/**
 * @param {string} type
 * @returns {Promise<string>}
 */
async function getGif(type) {
	const gif = await utils.sql.get("SELECT url FROM interaction_gifs WHERE type = $1 ORDER BY RAND() LIMIT 1", type)
	return gif.url
}

commands.assign(cmds)
