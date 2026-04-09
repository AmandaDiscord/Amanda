import crypto = require("crypto")

import Canvas = require("canvas")

import passthrough = require("../passthrough")
const { client, commands, confprovider, sql } = passthrough

import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")

import imageCache = require("../ImageCache")

import { type APIMessageTopLevelComponent, ComponentType, MessageFlags } from "discord-api-types/v10"
import type { ChatInputCommand } from "@amanda/commands"
import type { Lang } from "@amanda/lang"

import { en_us as English } from "@amanda/lang"

const nameRegex = /[^a-zA-Z0-9_-]+/g

const cmds = [
	{
		name: English.bean.name,
		description: English.bean.description,
		category: "interaction",
		integration_types: [0, 1],
		contexts: [0, 2],
		options: [
			{
				name: English.bean.options.user.name,
				type: 6,
				description: English.bean.options.user.description,
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
		name: English.ship.name,
		description: English.ship.description,
		category: "interaction",
		integration_types: [0, 1],
		contexts: [0, 2],
		options: [
			{
				name: English.ship.options.user2.name,
				type: 6,
				description: English.ship.options.user2.description,
				required: true
			},
			{
				name: English.ship.options.user1.name,
				type: 6,
				description: English.ship.options.user1.description,
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
	},
	{
		name: English.chat.name,
		description: English.chat.description,
		category: "interaction",
		integration_types: [0, 1],
		contexts: [0, 1, 2],
		options: [
			{
				name: English.chat.options.prompt.name,
				type: 3,
				description: English.chat.options.prompt.description,
				required: true
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.ai_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.AI_OFFLINE
				})
			}

			const prompt = cmd.data.options.get("prompt")!.asString()!

			const response = await fetch(`${confprovider.config.ai_url}/api/v1/chat`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${confprovider.config.ai_token}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					model: confprovider.config.ai_model_id,
					system_prompt: confprovider.config.ai_system_prompt,
					input: `${cmd.author.global_name} just sent this to you: ${prompt}`
				})
			})

			const data: { output: Array<{ type: "message", content: string } | { type: "tool_call", tool: string }> } = await response.json()
			const content = data.output.filter(o => o.type === "message").map(o => o.content).join("\n")

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: content.length > 2000 ? `${content.slice(0, 1990)}…` : content
			})
		},
	}
] as Parameters<typeof commands.assign>["0"]

type InteractionType = "hug" | "nom" | "kiss" | "cuddle" | "poke" | "slap" | "boop" | "pat"

const interactionSources: Array<{
	name: InteractionType;
	description: string;
	shortcut: "weeb.sh" | "durl";
	traaOverride?: boolean;
	url?: () => Promise<string>;
}> = [
	{
		name: English.hug.name, // Command object key and text filler
		description: English.hug.description, // Command description
		shortcut: "weeb.sh", // Where the image should be fetched from
		traaOverride: true // don't set this true for newly added types
	},
	{
		name: English.nom.name,
		description: English.nom.description,
		shortcut: "weeb.sh"
	},
	{
		name: English.kiss.name,
		description: English.kiss.description,
		shortcut: "weeb.sh",
		traaOverride: true
	},
	{
		name: English.cuddle.name,
		description: English.cuddle.description,
		shortcut: "weeb.sh",
		traaOverride: true
	},
	{
		name: English.poke.name,
		description: English.poke.description,
		shortcut: "weeb.sh"
	},
	{
		name: English.slap.name,
		description: English.slap.description,
		shortcut: "weeb.sh"
	},
	{
		name: English.boop.name,
		description: English.boop.description,
		shortcut: "durl",
		url: () => { return getGif("boop") }
	},
	{
		name: English.pat.name,
		description: English.pat.description,
		shortcut: "weeb.sh",
		traaOverride: true
	}
]

for (const source of interactionSources) {
	const newCommand: import("@amanda/shared-types").UnpackArray<Parameters<typeof commands.assign>["0"]> = {
		name: source.name,
		description: source.description,
		category: "interaction",
		integration_types: [0, 1],
		contexts: [0, 2],
		options: [
			{
				name: English[source.name].options.user.name,
				type: 6,
				description: English[source.name].options.user.description,
				required: true
			}
		],
		process: (cmd, lang) => doInteraction(cmd, lang, source.name, source.shortcut, source.url)
	}
	cmds.push(newCommand)
}

function doInteraction(
	cmd: ChatInputCommand,
	lang: Lang,
	source: InteractionType,
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

	let fetched: Promise<string> | undefined
	let footer: string

	if (shortcut === "weeb.sh") {
		footer = "Powered by weeb.sh"
		fetched = fetch(`https://api.weeb.sh/images/random?nsfw=false&type=${source}&filetype=gif`, {
			headers: {
				Authorization: `Wolke ${confprovider.config.weeb_token}`
			}
		}).then(d => d.json()
			.then(j => j.url))
			.catch(() => "https://b.catgirlsare.sexy/3ttIsFrtqsQP.png")
	} else if (shortcut === "durl") fetched = url!()
	else fetched = Promise.reject(new Error("Shortcut didn't match a function."))

	fetched.then(u => {
		const keyOther = `${source.toUpperCase()}_OTHER` as `${Uppercase<typeof source>}_OTHER`

		const extra: Array<APIMessageTopLevelComponent> = footer
			? [{
					type: ComponentType.Separator,
					spacing: 2
				},
				{
					type: ComponentType.TextDisplay,
					content: footer
				}]
			: []

		return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
			flags: MessageFlags.IsComponentsV2,
			components: [
				{
					type: ComponentType.TextDisplay,
					content: langReplace(lang.GLOBAL[keyOther], {
						"user": `<@${cmd.author.id}>`,
						"action": source,
						"mention": `<@${user.id}>`
					})
				},
				{
					type: ComponentType.MediaGallery,
					items: [
						{
							media: {
								url: u
							}
						}
					]
				},
				...extra
			]
		})
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
