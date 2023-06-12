import sG = require("simple-git")
const simpleGit = sG.simpleGit(__dirname)

import passthrough = require("../passthrough")
const { client, confprovider, commands/* , sync, sql*/ } = passthrough

// const emojis: typeof import("../emojis") = sync.require("../emojis")

import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")

import type { APIEmbed } from "discord-api-types/v10"
import type { Lang } from "@amanda/lang"

function bToMB(number: number) {
	return `${((number / 1024) / 1024).toFixed(2)}MB`
}

commands.assign([
	{
		name: "stats",
		description: "Show detailed statistics",
		category: "meta",
		process(cmd, lang, shardID) {
			const leadingIdentity = `${client.user.username}#${client.user.discriminator} <:online:606664341298872324>\n${confprovider.config.cluster_id} tree, branch ${shardID}`
			// eslint-disable-next-line no-irregular-whitespace
			// const leadingSpace = `${emojis.bl}\n​`
			const ram = process.memoryUsage()

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						color: confprovider.config.standard_embed_color,
						fields: [
							{
								name: leadingIdentity,
								value: `**❯ ${lang.GLOBAL.HEADER_UPTIME}:**\n${sharedUtils.shortTime(process.uptime(), "sec")}\n`
									+ `**❯ ${lang.GLOBAL.HEADER_MEMORY}:**\n${bToMB(ram.rss - (ram.heapTotal - ram.heapUsed))}\n`/* ,
								inline: true*/
							}/* ,
							{
								name: leadingSpace,
								value: `**${lang.GLOBAL.HEADER_USER_COUNT}:**\n${text.numberComma(stats.users)}\n`
								+ `**❯ ${lang.GLOBAL.HEADER_GUILD_COUNT}:**\n${text.numberComma(stats.guilds)}\n`
								+ `**❯ ${lang.GLOBAL.HEADER_VOICE_CONNECTIONS}:**\n${text.numberComma(stats.connections)}`,
								inline: true
							}*/
						]
					}
				]
			})
		}
	},
	{
		name: "info",
		description: "Gets info about Amanda",
		category: "meta",
		process(cmd, lang) {
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						description: lang.GLOBAL.INFO_THANKS,
						fields: [
							{
								name: lang.GLOBAL.HEADER_CREATORS,
								value: "PapiOphidian#0110 <:bravery:479939311593324557> <:VerifiedDeveloper:699408396591300618> <:EarlySupporter:585638218255564800> <:NitroBadge:421774688507920406> <:boostlvl3:582555022508687370>"
							},
							{
								name: lang.GLOBAL.HEADER_CODE,
								value: `[node.js](https://nodejs.org/) ${process.version} + [SnowTransfer](https://www.npmjs.com/package/snowtransfer) & [CloudStorm](https://www.npmjs.com/package/cloudstorm)`
							},
							{
								name: lang.GLOBAL.HEADER_LINKS,
								value: langReplace(lang.GLOBAL.INFO_LINKS, {
									"website": `${confprovider.config.website_protocol}://${confprovider.config.website_domain}/`,
									"stats": confprovider.config.stats_url,
									"server": confprovider.config.server_url,
									"patreon": confprovider.config.patreon_url,
									"paypal": confprovider.config.paypal_url,
									"privacy": confprovider.config.privacy_url,
									"todo": confprovider.config.todo_url
								}) +
								`\n${confprovider.config.add_url}`
							}
						],
						color: confprovider.config.standard_embed_color
					}
				]
			})
		}
	},
	{
		name: "git",
		description: "Gets the latest git commits to Amanda",
		category: "meta",
		async process(cmd, lang) {
			const limit = 5
			const authorNameMap = {
				"Cadence Ember": "Cadence",
				"Papa": "PapiOphidian"
			}
			const status = await simpleGit.status()
			const log = await simpleGit.log({ "--no-decorate": null })
			const diffs = await Promise.all(Array(limit).fill(undefined).map((_, i) => simpleGit.diffSummary([log.all[i + 1].hash, log.all[i].hash])))
			const res = { branch: status.current!, latestCommitHash: log.latest!.hash.slice(0, 7), logString:
				log.all.slice(0, limit).map((line, index) => {
					const date = new Date(line.date)
					const dateString = `${date.toDateString()} @ ${date.toTimeString().split(":").slice(0, 2).join(":")}`

					const filesChanged = diffs[index].files.length > 1
						? langReplace(lang.GLOBAL.GIT_FILES_CHANGED, { "amount": diffs[index].files.length })
						: lang.GLOBAL.GIT_FILE_CHANGED

					const insertions = diffs[index].insertions > 1
						? langReplace(lang.GLOBAL.GIT_INSERTIONS, { "amount": diffs[index].insertions })
						: lang.GLOBAL.GIT_INSERTION

					const deletions = diffs[index].deletions > 1
						? langReplace(lang.GLOBAL.GIT_DELETIONS, { "amount": diffs[index].deletions })
						: lang.GLOBAL.GIT_DELETION

					const diff =
						filesChanged +
						insertions +
						deletions

					return `\`» ${line.hash.slice(0, 7)}: ${dateString} — ${authorNameMap[line.author_name] || "Unknown"}\`\n` +
									`\`» ${diff}\`\n${line.message}`
				}).join("\n\n") }

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						title: lang.GLOBAL.HEADER_GIT_INFO,
						fields: [
							{
								name: lang.GLOBAL.HEADER_STATUS,
								value: langReplace(lang.GLOBAL.GIT_STATUS, { "branch": res.branch, "hash": res.latestCommitHash })
							},
							{
								name: langReplace(lang.GLOBAL.GIT_COMMITS, { "amount": limit }),
								value: res.logString
							}
						],
						color: confprovider.config.standard_embed_color
					}
				]
			})
		}
	},
	{
		name: "help",
		description: "Your average help command",
		category: "meta",
		options: [
			{
				name: "category",
				type: 3,
				description: "The category to get help with",
				choices: ["meta", ...commands.categories.keys()].map(i => ({ name: i, value: i })),
				required: false
			},
			{
				name: "command",
				type: 3,
				description: "The command to get help with",
				required: false
			}
		],
		process(cmd, lang) {
			let embed: APIEmbed
			const category = cmd.data.options.get("category")?.asString()
			const command = cmd.data.options.get("command")?.asString()
			if (category || command) {
				if (command && commands.commands.has(command)) {
					const c = commands.commands.get(command)!
					const info = getDocs(c, lang)

					embed = {
						author: { name: c.name },
						description: langReplace(lang.GLOBAL.HELP_COMMAND_BODY, {
							"description": info.description,
							"args": info.options?.map(o => o.name).join(", ") || lang.GLOBAL.NONE,
							"category": c.category
						}),
						footer: { text: lang.GLOBAL.FOOTER_HELP },
						color: confprovider.config.standard_embed_color
					}

					client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { embeds: [embed] })
				} else if (category && category != "hidden" && commands.categories.has(category)) {
					const cat = commands.categories.get(category)! as Array<Exclude<keyof typeof lang, "GLOBAL">>
					const maxLength = cat.reduce((acc, cur) => Math.max(acc, cur.length), 0)
					embed = {
						author: { name: langReplace(lang.GLOBAL.HEADER_COMMAND_CATEGORY, { "category": category }) },
						description: cat.sort((a, b) => {
							const cmda = commands.commands.get(a)!
							const cmdb = commands.commands.get(b)!

							if (cmda.order !== undefined && cmdb.order !== undefined) { // both are numbers, sort based on that, lowest first
								return cmda.order - cmdb.order
							} else if (cmda.order !== undefined) { // a is defined, sort a first
								return -1
							} else if (cmdb.order !== undefined) { // b is defined, sort b first
								return 1
							} else { // we don't care
								return 0
							}
						}).map(c2 => {
							const cm = commands.commands.get(c2)!
							let desc = cm.description
							let name = cm.name
							if (lang[c2]) {
								name = lang[c2].name
								desc = lang[c2].description
							}
							let repeat = maxLength - name.length
							if (isNaN(repeat) || !repeat || repeat < 0) repeat = 0
							return `\`${name}${" ​".repeat(repeat)}\` ${desc}`
						}).join("\n"),
						color: confprovider.config.standard_embed_color
					}

					client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { embeds: [embed] })
				} else {
					embed = {
						description: langReplace(lang.GLOBAL.HELP_INVALID_COMMAND, { "tag": `${cmd.author.username}#${cmd.author.discriminator}` }),
						color: 0xB60000
					}

					client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { embeds: [embed] })
				}
			} else {
				const categories = Array.from(commands.categories.keys()).filter(c => c != "admin" && c != "hidden").join("\n❯ ")
				const seeAll = langReplace(lang.GLOBAL.HELP_SEE_ALL, { "prefix": "/" })
				const helpInfo = langReplace(lang.GLOBAL.HELP_INFO, {
					"prefix": "/",
					"link": confprovider.config.invite_link_for_help
				})

				embed = {
					author: { name: lang.GLOBAL.HEADER_COMMAND_CATEGORIES },
					description: `❯ ${categories}\n\n${seeAll}\n\n${helpInfo}`,
					color: confprovider.config.standard_embed_color
				}

				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { embeds: [embed] })
			}
		}
	}
])

function getDocs(c: import("@amanda/shared-types").UnpackArray<Parameters<typeof commands["assign"]>["0"]>, lang: Lang) {
	let info = {
		name: c.name,
		description: c.description,
		options: c.options as Array<{ name: string; description: string; options?: Array<{ name: string; description: string; }> }>
	}

	if (lang[c.name]) {
		info = {
			name: lang[c.name as Exclude<keyof typeof lang, "GLOBAL">].name,
			description: lang[c.name as Exclude<keyof typeof lang, "GLOBAL">].description,
			options: lang[c.name as "image"].options
		}
	}

	return info
}