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
				type: 6,
				description: "The second user to ship",
				required: true
			},
			{
				name: "user1",
				type: 6,
				description: "The user to ship user2 with other than yourself",
				required: false
			}
		],
		async process(cmd, lang) {
			const user1 = cmd.data!.resolved!.users![(cmd.data!.options!.find(o => o.name === "user1") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString).value]
			const user2 = cmd.data!.resolved!.users![(cmd.data!.options!.find(o => o.name === "user2") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString).value]
			const author = cmd.user ? cmd.user : cmd.member!.user
			if (user1.id == user2.id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.CANNOT_SELF_SHIP, { "username": author.username }) })
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })
			const crow = await orm.db.raw("SELECT * FROM couples WHERE user1 = $1 OR user2 = $1", [user1.id])?.[0]
			if (crow) {
				const otherID = user1.id === crow.user1 ? crow.user2 : crow.user1
				const you = user1.id === author.id
				if (otherID === user2.id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `I don't think I have to rate ${you ? "you" : user1.username} and ${user2.username} if ${you ? "you two are" : "they're"} married already. ${you ? "You're" : "They're"} a cute couple <:amandacomfy:726132738918318260>` })
			}

			const canvas = new Jimp(300, 100)
			const [pfp1, pfp2, heart] = await Promise.all([
				discordUtils.getAvatarJimp(user1.id),
				discordUtils.getAvatarJimp(user2.id),
				Jimp.read("./images/emojis/heart.png")
			]).catch(() => [undefined, undefined, undefined])

			if (!pfp1 || !pfp2 || !heart) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "There was an error getting either user's avatar" })

			pfp1.resize(100, 100)
			pfp2.resize(100, 100)
			heart.resize(80, 80)

			canvas.composite(pfp1, 0, 0)
			canvas.composite(heart, 110, 10)
			canvas.composite(pfp2, 200, 0)

			const buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
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
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: language.replace(lang.GLOBAL.SHIP_RATING, { "display1": `${user1.username}#${user1.discriminator}`, "display2": `${user2.username}#${user2.discriminator}`, "percentage": percentage }),
				files: [
					{
						name: `ship_${user1.username}_${user2.username}`.replace(/[^a-zA-Z0-9_-]+/g, "") + ".png",
						file: buffer
					}
				]
			})
		}
	},
	{
		name: "bean",
		description: "Beans a user",
		category: "interaction",
		options: [
			{
				name: "user",
				type: 6,
				description: "The user to bean",
				required: true
			}
		],
		process(cmd, lang) {
			const author = cmd.user ? cmd.user : cmd.member!.user
			if (!cmd.guild_id) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.GUILD_ONLY, { "username": author.username }) } })
			const user = cmd.data!.resolved!.users![(cmd.data!.options!.find(o => o.name === "user") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString).value]
			if (user.id == client.user!.id) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: "No u" } })
			if (user.id == author.id) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.CANNOT_SELF_BEAN, { "username": author.username }) } })
			return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL.BEANED, { "tag": `**${user.username}#${user.discriminator}**` }) } })
		}
	}
] as Parameters<typeof commands.assign>["0"]

const interactionSources = [
	{
		name: "hug", // Command object key and text filler
		description: "Hugs someone", // Command description
		shortcut: "weeb.sh", // Where the image should be fetched from
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
				type: 6,
				description: `The user to ${source.name}`,
				required: true
			}
		],
		process: (cmd, lang) => doInteraction(cmd, lang, source.name as Parameters<typeof doInteraction>["2"], source.shortcut, source.url)
	} as import("../types").UnpackArray<Parameters<typeof commands.assign>["0"]>
	cmds.push(newCommand)
}

async function doInteraction(cmd: import("discord-typings").Interaction, lang: import("@amanda/lang").Lang, source: Extract<keyof import("@amanda/lang").Lang, "hug" | "nom" | "kiss" | "cuddle" | "poke" | "slap" | "boop" | "pat">, shortcut: string, url?: () => Promise<string>) {
	const author = cmd.user ? cmd.user : cmd.member!.user
	const user = cmd.data!.resolved!.users![(cmd.data!.options!.find(o => o.name === "user") as import("discord-typings").ApplicationCommandInteractionDataOptionAsTypeString).value]
	const keyAmanda = `${source.toUpperCase()}_AMANDA` as `${Uppercase<typeof source>}_AMANDA`
	if (user.id == author.id) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: arrayUtils.random(responses) } })
	if (user.id == client.user!.id) return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { content: language.replace(lang.GLOBAL[keyAmanda], { "username": author.username }) } })
	await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })
	let fetched: Promise<string> | undefined = undefined
	let footer: string
	if (!fetched) {
		if (shortcut == "weeb.sh") {
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
		const keyOther = `${source.toUpperCase()}_OTHER` as `${Uppercase<typeof source>}_OTHER`
		const embed: import("discord-typings").Embed = {
			description: language.replace(lang.GLOBAL[keyOther], { "username": author.username, "action": source, "mention": `<@${user.id}>` }),
			image: { url: u },
			color: constants.standard_embed_color
		}
		if (footer) embed.footer = { text: footer }
		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: null, embeds: [embed] })
	}).catch(error => {
		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: `There was an error: \`\`\`\n${error}\`\`\`` })
	})
}

async function getGif(type: string): Promise<string> {
	const gif = await orm.db.raw("SELECT url FROM interaction_gifs WHERE type = $1 ORDER BY RANDOM() LIMIT 1", [type])
	return gif[0].url as string
}

commands.assign(cmds)
