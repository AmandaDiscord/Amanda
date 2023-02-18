import Jimp = require("jimp")
import crypto = require("crypto")

import passthrough = require("../../passthrough")
const { constants, client, commands, sync, config } = passthrough

const language: typeof import("../utils/language") = sync.require("../utils/language")
const orm: typeof import("../utils/orm") = sync.require("../utils/orm")
const discordUtils: typeof import("../utils/discord") = sync.require("../utils/discord")
const arrayUtils: typeof import("../utils/array") = sync.require("../utils/array")

const nameRegex = /[^a-zA-Z0-9_-]+/g

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
			const user1 = cmd.data.users.get(cmd.data.options.get("user1")?.asString() || "") || cmd.author
			const user2 = cmd.data.users.get(cmd.data.options.get("user2")!.asString()!)!
			if (user1.id == user2.id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.CANNOT_SELF_SHIP, { "username": cmd.author.username }) })

			const canvas = new Jimp(300, 100)
			const [pfp1, pfp2, heart] = await Promise.all([
				discordUtils.getAvatarJimp(user1),
				discordUtils.getAvatarJimp(user2),
				Jimp.read("./images/emojis/heart.png")
			]).catch(() => [undefined, undefined, undefined])

			if (!pfp1 || !pfp2 || !heart) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.AVATAR_FETCH_FAILED })

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
						name: `ship_${user1.username}_${user2.username}`.replace(nameRegex, "") + ".png",
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
			if (!cmd.guild_id) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.GUILD_ONLY, { "username": cmd.author.username }) })
			const user = cmd.data.users.get(cmd.data.options.get("user")!.asString()!)!
			if (user.id === passthrough.configuredUserID) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.NO_U })
			if (user.id === passthrough.configuredUserID) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.CANNOT_SELF_BEAN, { "username": cmd.author.username }) })
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL.BEANED, { "tag": `**${user.username}#${user.discriminator}**` }) })
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
	const newCommand: import("../../types").UnpackArray<Parameters<typeof commands.assign>["0"]> = {
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
	}
	cmds.push(newCommand)
}

function doInteraction(cmd: import("../../Command"), lang: import("@amanda/lang").Lang, source: Extract<keyof import("@amanda/lang").Lang, "hug" | "nom" | "kiss" | "cuddle" | "poke" | "slap" | "boop" | "pat">, shortcut: string, url?: () => Promise<string>) {
	const user = cmd.data.users.get(cmd.data.options.get("user")!.asString()!)!
	const keyAmanda = `${source.toUpperCase()}_AMANDA` as `${Uppercase<typeof source>}_AMANDA`

	if (user.id == cmd.author.id) {
		const responses = [
			lang.GLOBAL.INTERACTION_RESPONSE_1,
			lang.GLOBAL.INTERACTION_RESPONSE_2,
			lang.GLOBAL.INTERACTION_RESPONSE_3,
			lang.GLOBAL.INTERACTION_RESPONSE_4,
			lang.GLOBAL.INTERACTION_RESPONSE_5,
			lang.GLOBAL.INTERACTION_RESPONSE_6,
			lang.GLOBAL.INTERACTION_RESPONSE_7,
			lang.GLOBAL.INTERACTION_RESPONSE_8,
			lang.GLOBAL.INTERACTION_RESPONSE_9,
			"<:NotLikeCat:411364955493761044>"
		]
		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: arrayUtils.random(responses) })
	}

	if (user.id === passthrough.configuredUserID) return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: language.replace(lang.GLOBAL[keyAmanda], { "username": cmd.author.username }) })
	let fetched: Promise<string> | undefined = undefined
	let footer: string
	if (!fetched) {
		if (shortcut == "weeb.sh") {
			footer = "Powered by weeb.sh"
			fetched = fetch(`https://api.weeb.sh/images/random?nsfw=false&type=${source}&filetype=gif`, { headers: { Authorization: `Wolke ${config.weeb_api_key}` } }).then(d => d.json().then(j => j.url)).catch(() => "https://cdn.discordapp.com/attachments/608456955660468224/1076558288604364830/helloamanda.png")
		} else if (shortcut == "durl") fetched = url!()
		else fetched = Promise.reject(new Error("Shortcut didn't match a function."))
	}
	fetched.then(u => {
		const keyOther = `${source.toUpperCase()}_OTHER` as `${Uppercase<typeof source>}_OTHER`
		const embed: import("discord-api-types/v10").APIEmbed = {
			description: language.replace(lang.GLOBAL[keyOther], { "user": cmd.author.username, "action": source, "mention": `<@${user.id}>` }),
			image: { url: u },
			color: constants.standard_embed_color
		}
		if (footer) embed.footer = { text: footer }
		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: null, embeds: [embed] })
	})
}

async function getGif(type: string): Promise<string> {
	if (!config.db_enabled) throw new Error("DATABASE_NOT_ENABLED")
	const gif = await orm.db.raw("SELECT url FROM interaction_gifs WHERE type = $1 ORDER BY RANDOM() LIMIT 1", [type])
	return gif[0].url as string
}

commands.assign(cmds)
