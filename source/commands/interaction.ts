import Discord from "thunderstorm"
import Jimp from "jimp"
import crypto from "crypto"
import c from "centra"

import passthrough from "../passthrough"
const { constants, client, commands, sync, weebsh } = passthrough

const language = sync.require("../utils/language") as typeof import("../utils/language")
const orm = sync.require("../utils/orm") as typeof import("../utils/orm")
const discordUtils = sync.require("../utils/discord") as typeof import("../utils/discord")
const arrayUtils = sync.require("../utils/array") as typeof import("../utils/array")

const responses = ["That's not strange at all...", "W-What? Why?", "I find it strange that you tried to do that...", "Ok then...", "Come on... Don't make yourself look like an idiot...", "Why even try?", "Oh...", "You are so weird...", "<:NotLikeCat:411364955493761044>"]

const cmds = [
	{
		name: "ship",
		description: "Ships two people",
		category: "interaction",
		options: [
			{
				name: "user2",
				type: Discord.Constants.ApplicationCommandOptionTypes.USER,
				description: "The second user to ship"
			},
			{
				name: "user1",
				type: Discord.Constants.ApplicationCommandOptionTypes.USER,
				description: "The user to ship user2 with other than yourself",
				required: false
			}
		],
		async process(cmd, lang) {
			const user1 = cmd.options.getUser("user1", false) || cmd.user
			const user2 = cmd.options.getUser("user2", true)!

			if (user1.id == user2.id) return cmd.reply(language.replace(lang.interaction.ship.prompts.selfShip, { "username": cmd.user.username }))
			await cmd.defer()
			const crow = await orm.db.raw("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [user1.id])?.[0]
			if (crow) {
				const otherID = user1.id === crow.user1 ? crow.user2 : crow.user1
				const you = user1.id === cmd.user.id
				if (otherID === user2.id) return cmd.editReply(`I don't think I have to rate ${you ? "you" : user1.tag} and ${user2.tag} if ${you ? "you two are" : "they're"} married already. ${you ? "You're" : "They're"} a cute couple <:amandacomfy:726132738918318260>`)
			}

			const canvas = new Jimp(300, 100)
			const [pfp1, pfp2, heart] = await Promise.all([
				discordUtils.getAvatarJimp(user1.id),
				discordUtils.getAvatarJimp(user2.id),
				Jimp.read("./images/emojis/heart.png")
			])

			if (!pfp1 || !pfp2) return cmd.editReply("There was an error getting either user's avatar")

			pfp1.resize(100, 100)
			pfp2.resize(100, 100)
			heart.resize(80, 80)

			canvas.composite(pfp1, 0, 0)
			canvas.composite(heart, 110, 10)
			canvas.composite(pfp2, 200, 0)

			const buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			const image = new Discord.MessageAttachment(buffer, `${`ship_${user1.username}_${user2.username}`.replace(/[^a-zA-Z0-9_-]+/g, "")}.png`)
			const strings = [user1.id, user2.id].sort((a, b) => Number(a) - Number(b)).join(" ")
			let percentage: number | undefined = undefined

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
			return cmd.editReply({ content: language.replace(lang.interaction.ship.returns.rating, { "display1": user1.tag, "display2": user2.tag, "percentage": percentage }), files: [image] })
		}
	},
	{
		name: "bean",
		description: "Beans a user",
		category: "interaction",
		options: [
			{
				name: "user",
				type: Discord.Constants.ApplicationCommandOptionTypes.USER,
				description: "The user to bean"
			}
		],
		process(cmd, lang) {
			if (!cmd.guildId) return cmd.reply(language.replace(lang.interaction.bean.prompts.guildOnly, { "username": cmd.user.username }))
			const user = cmd.options.getUser("user", true)!
			if (user.id == client.user!.id) return cmd.reply("No u")
			if (user.id == cmd.user.id) return cmd.reply(language.replace(lang.interaction.bean.prompts.selfBean, { "username": cmd.user.username }))
			return cmd.reply(language.replace(lang.interaction.bean.returns.beaned, { "tag": `**${user.tag}**` }))
		}
	}
] as Parameters<typeof commands.assign>["0"]

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
		shortcut: "weeb.sh",
		aliases: ["bite"]
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
		name: source.name,
		description: source.description,
		category: "interaction",
		options: [
			{
				name: "user",
				type: Discord.Constants.ApplicationCommandOptionTypes.USER,
				description: `The user to ${source.name}`
			}
		],
		process: (cmd, lang) => doInteraction(cmd, lang, source.name as Exclude<keyof import("@amanda/lang").Lang["interaction"], "ship" | "bean">, source.shortcut, source.url)
	} as import("../types").UnpackArray<Parameters<typeof commands.assign>["0"]>
	cmds.push(newCommand)
}

async function doInteraction(cmd: import("thunderstorm").CommandInteraction, lang: import("@amanda/lang").Lang, source: Exclude<keyof import("@amanda/lang").Lang["interaction"], "ship" | "bean">, shortcut: string, url?: () => Promise<string>) {
	const user = cmd.options.getUser("user", true)!
	if (user.id == cmd.user.id) return cmd.reply(arrayUtils.random(responses))
	if (user.id == client.user!.id) return cmd.reply(language.replace(lang.interaction[source].returns.amanda, { "username": cmd.user.username }))
	await cmd.defer()
	let fetched: Promise<string> | undefined = undefined
	let footer: string
	if (!fetched) {
		if (shortcut == "nekos.life") {
			footer = "Powered by nekos.life"
			fetched = new Promise((resolve, reject) => {
				c(`https://nekos.life/api/v2/img/${source}`).send().then(async body => {
					const data = await body.json()
					resolve(data.url)
				}).catch(reject)
			})
		} else if (shortcut == "weeb.sh") {
			footer = "Powered by weeb.sh"
			fetched = new Promise(resolve => {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				weebsh.toph.getRandomImage(source, { nsfw: false, fileType: "gif" }).then(data => {
					resolve(data.url)
				})
			})
		} else if (shortcut == "durl") fetched = url!()
		else fetched = Promise.reject(new Error("Shortcut didn't match a function."))
	}
	fetched!.then(u => {
		const embed = new Discord.MessageEmbed()
			.setDescription(language.replace(lang.interaction[source].returns.action, { "username": cmd.user.username, "action": source, "mention": `<@${user.id}>` }))
			.setImage(u)
			.setColor(constants.standard_embed_color)
		if (footer) embed.setFooter(footer)
		return cmd.editReply({ content: null, embeds: [embed] })
	}).catch(error => { return cmd.editReply(`There was an error: \`\`\`\n${error}\`\`\``) })
}

async function getGif(type: string): Promise<string> {
	const gif = await orm.db.raw("SELECT url FROM interaction_gifs WHERE type = $1 ORDER BY RANDOM() LIMIT 1", [type])
	return gif[0].url as string
}

commands.assign(cmds)
