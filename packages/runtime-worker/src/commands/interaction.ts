import passthrough = require("../passthrough")
const { client, commands, confprovider, sql } = passthrough

import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")

import type { APIEmbed } from "discord-api-types/v10"
import type { ChatInputCommand } from "@amanda/commands"
import type { Lang } from "@amanda/lang"

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
				content: langReplace(lang.GLOBAL.BEANED, { "tag": `**${user.username}#${user.discriminator}**` })
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
		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			content: sharedUtils.arrayRandom(responses)
		})
	}

	if (user.id === confprovider.config.client_id) {
		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			content: langReplace(lang.GLOBAL[keyAmanda], { "username": cmd.author.username })
		})
	}

	let fetched: Promise<string> | undefined = undefined
	let footer: string

	if (shortcut == "weeb.sh") {
		footer = "Powered by weeb.sh"
		fetched = fetch(`https://api.weeb.sh/images/random?nsfw=false&type=${source}&filetype=gif`, {
			headers: {
				Authorization: `Wolke ${confprovider.config.weeb_token}`
			}
		}).then(d => d.json()
			.then(j => j.url))
			.catch(() => "https://cdn.discordapp.com/attachments/608456955660468224/1076558288604364830/helloamanda.png")
	} else if (shortcut == "durl") fetched = url!()
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
	const gif = await sql.get("SELECT url FROM interaction_gifs WHERE type = $1 ORDER BY RANDOM() LIMIT 1", [type])
	if (!gif) throw new Error("NO_GIF")
	return gif.url as string
}

commands.assign(cmds)
