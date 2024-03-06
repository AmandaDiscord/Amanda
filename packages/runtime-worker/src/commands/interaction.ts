import crypto = require("crypto")

import Canvas = require("canvas")

import passthrough = require("../passthrough")
const { client, commands, confprovider, sql } = passthrough

import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")

import imageCache = require("../ImageCache")

import type { APIEmbed } from "discord-api-types/v10"
import type { ChatInputCommand } from "@amanda/commands"
import type { Lang } from "@amanda/lang"

const nameRegex = /[^a-zA-Z0-9_-]+/g

const cmds = [
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
			if (!cmd.guild_id) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.GUILD_ONLY, { "username": cmd.author.username })
				})
			}

			const user = cmd.data.users.get(cmd.data.options.get("user")!.asString()!)!

			if (user.id === confprovider.config.client_id) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NO_U
				})
			}

			if (user.id === cmd.author.id) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.CANNOT_SELF_BEAN, { "username": cmd.author.username })
				})
			}

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: langReplace(lang.GLOBAL.BEANED, { "tag": `**${sharedUtils.userString(user)}**` })
			})
		}
	},
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
			const user1 = cmd.data.users.get(cmd.data.options.get("user1")?.asString() ?? "") ?? cmd.author
			const user2 = cmd.data.users.get(cmd.data.options.get("user2")!.asString()!)!

			const member1 = cmd.data.members.get(cmd.data.options.get("user1")?.asString() ?? "")
			const member2 = cmd.data.members.get(cmd.data.options.get("user2")!.asString()!)

			if (user1.id === user2.id) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace(lang.GLOBAL.CANNOT_SELF_SHIP, { "username": cmd.author.username })
				})
			}

			const canvas = Canvas.createCanvas(300, 100)
			const ctx = canvas.getContext("2d")

			const [pfp1, pfp2, heart] = await Promise.all([
				Canvas.loadImage(sharedUtils.displayAvatarURL(user1, member1, cmd.guild_id)),
				Canvas.loadImage(sharedUtils.displayAvatarURL(user2, member2, cmd.guild_id)),
				imageCache.get("heart")
			])

			ctx.drawImage(pfp1, 0, 0, 100, 100)
			ctx.drawImage(heart, 110, 10, 80, 80)
			ctx.drawImage(pfp2, 200, 0, 100, 100)

			const buffer = ctx.canvas.toBuffer("image/png")
			const strings = [user1.id, user2.id].sort((a, b) => Number(a) - Number(b)).join(" ")

			const hash = crypto.createHash("sha256").update(strings).digest("hex").slice(0, 6)
			const percentage = Number(`0x${hash}`) % 101

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: langReplace(lang.GLOBAL.SHIP_RATING, {
					"display1": sharedUtils.userString(user1),
					"display2": sharedUtils.userString(user2),
					"percentage": percentage
				}),
				files: [
					{
						name: `ship_${user1.username}_${user2.username}`.replace(nameRegex, "") + ".png",
						file: buffer
					}
				]
			})
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
	const newCommand: import("@amanda/shared-types").UnpackArray<Parameters<typeof commands.assign>["0"]> = {
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

function doInteraction(
	cmd: ChatInputCommand,
	lang: Lang,
	source: Extract<keyof Lang, "hug" | "nom" | "kiss" | "cuddle" | "poke" | "slap" | "boop" | "pat">,
	shortcut: string,
	url?: () => Promise<string>
) {
	const user = cmd.data.users.get(cmd.data.options.get("user")!.asString()!)!
	const keyAmanda = `${source.toUpperCase()}_AMANDA` as `${Uppercase<typeof source>}_AMANDA`

	if (user.id === cmd.author.id) {
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

		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			content: sharedUtils.arrayRandom(responses)
		})
	}

	if (user.id === confprovider.config.client_id) {
		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			content: langReplace(lang.GLOBAL[keyAmanda], { "username": cmd.author.username })
		})
	}

	let fetched: Promise<string> | undefined = void 0
	let footer: string

	if (shortcut === "weeb.sh") {
		footer = "Powered by weeb.sh"
		fetched = fetch(`https://api.weeb.sh/images/random?nsfw=false&type=${source}&filetype=gif`, {
			headers: {
				Authorization: `Wolke ${confprovider.config.weeb_token}`
			}
		}).then(d => d.json()
			.then(j => j.url))
			.catch(() => "https://cdn.discordapp.com/attachments/1123048509470429365/1124107984528740392/helloamanda.png")
	} else if (shortcut === "durl") fetched = url!()
	else fetched = Promise.reject(new Error("Shortcut didn't match a function."))

	fetched.then(u => {
		const keyOther = `${source.toUpperCase()}_OTHER` as `${Uppercase<typeof source>}_OTHER`

		const embed: APIEmbed = {
			description: langReplace(lang.GLOBAL[keyOther], {
				"user": cmd.author.username,
				"action": source,
				"mention": `<@${user.id}>`
			}),
			image: { url: u },
			color: confprovider.config.standard_embed_color
		}

		if (footer) embed.footer = { text: footer }
		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: null, embeds: [embed] })
	}).catch(() => {
		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			content: "There was an error with that command"
		})
	})
}

async function getGif(type: string): Promise<string> {
	if (!confprovider.config.db_enabled) throw new Error("DATABASE_NOT_ENABLED")
	const gif = await sql.get<"interaction_gifs">("SELECT url FROM interaction_gifs WHERE type = $1 ORDER BY RANDOM() LIMIT 1", [type])
	if (!gif) throw new Error("NO_GIF")
	return gif.url as string
}

commands.assign(cmds)
