/* eslint-disable @typescript-eslint/ban-ts-comment */
import Discord from "thunderstorm"
import sG from "simple-git"
const simpleGit = sG(__dirname)

import passthrough from "../passthrough"
const { client, constants, config, commands, sync, requester, queues } = passthrough

const text = sync.require("../utils/string") as typeof import("../utils/string")
const emojis = sync.require("../emojis") as typeof import("../emojis")
const language = sync.require("../utils/language") as typeof import("../utils/language")
const time = sync.require("../utils/time") as typeof import("../utils/time")
const cluster = sync.require("../utils/cluster") as typeof import("../utils/cluster")

commands.assign([
	{
		name: "stats",
		description: "Show detailed statistics",
		category: "meta",
		options: [
			{
				name: "window",
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
				description: "The type of stats to show",
				choices: [
					{
						name: "gateway",
						value: "gw"
					},
					{
						name: "music",
						value: "m"
					}
				],
				required: false
			}
		],
		async process(cmd, lang) {
			await cmd.defer()
			const embed = new Discord.MessageEmbed().setColor(constants.standard_embed_color)
			const sid = cmd.guild ? Number((BigInt(cmd.guild.id) >> BigInt(22)) % BigInt(config.total_shards)) : 0
			const leadingIdentity = `${client.user!.tag} <:online:606664341298872324>\n${config.cluster_id} cluster, shard ${sid}`
			const leadingSpace = `${emojis.bl}\n​`

			const category = cmd.options.getString("window", false)
			if (category === "gw") {
				const before = Date.now()
				const stats = await requester.request(constants.GATEWAY_WORKER_CODES.STATS, undefined, (p) => passthrough.gateway.postMessage(p)) as { ram: { rss: number; heapTotal: number; heapUsed: number; }; latency: Array<number>; shards: Array<number>; uptime: number; }
				const ram = stats.ram.rss - (stats.ram.heapTotal - stats.ram.heapUsed)
				embed
					.addFields([
						{
							name: leadingIdentity,
							value: `**${lang.meta.ping.returns.heartbeat}:**\n${stats.latency.map((i, index) => `Shard ${stats.shards[index]}: ${i}ms`).join("\n")}\n`
							+ `**❯ ${lang.meta.statistics.returns.latency}:**\n${text.numberComma(Date.now() - before)}ms\n`
							+ `**❯ ${lang.meta.statistics.returns.uptime}:**\n${time.shortTime(stats.uptime, "sec")}\n`
							+ `**❯ ${lang.meta.statistics.returns.ramUsage}:**\n${bToMB(ram)}\n`,
							inline: true
						},
						{
							name: leadingSpace,
							value: `**❯ Shards:**\n[${stats.shards.join(", ")}]`,
							inline: true
						}
					])
				return cmd.followUp({ embeds: [embed] })
			} else if (category === "m") {
				const listeningcount = queues.reduce((acc, cur) => acc + cur.listeners.filter(u => !u.bot).size, 0)
				const nodes = constants.lavalinkNodes.map(n => n.id)
				let nodeStr = ""
				for (const node of nodes) {
					nodeStr += `${node}: ${queues.filter(q => q.node === node).size}\n`
				}
				embed
					.addFields([
						{
							name: leadingIdentity,
							value: `${language.replace(lang.meta.statistics.returns.songsQueued, { "number": text.numberComma(Array.from(queues.values()).reduce((acc, cur) => acc + cur.songs.length, 0)) })}`,
							inline: true
						},
						{
							name: leadingSpace,
							value: `${language.replace(lang.meta.statistics.returns.voiceConnections, { "number": text.numberComma(client.lavalink!.players.size) })}\n` +
								`${language.replace(lang.meta.statistics.returns.usersListening, { "number": text.numberComma(listeningcount) })}\n` +
								`**❯ Node usage:**\n${nodeStr || "No nodes"}`,
							inline: true
						}
					])
				return cmd.editReply({ embeds: [embed] })
			} else {
				const stats = await cluster.getOwnStats()
				const gateway = await requester.request(constants.GATEWAY_WORKER_CODES.STATS, undefined, (p) => passthrough.gateway.postMessage(p)) as { ram: { rss: number; heapTotal: number; heapUsed: number; }; latency: Array<number>; shards: Array<number>; uptime: number; }
				const nmsg = await cmd.followUp(lang.meta.statistics.prompts.slow)
				embed
					.addFields([
						{
							name: leadingIdentity,
							value: `**${lang.meta.ping.returns.heartbeat}:**\n${Math.floor(gateway.latency.reduce((acc, cur) => acc + cur, 0) / gateway.latency.length)}ms avg\n`
							+ `**❯ ${lang.meta.statistics.returns.latency}:**\n${text.numberComma(nmsg.createdTimestamp - cmd.createdTimestamp)}ms\n`
							+ `**❯ ${lang.meta.statistics.returns.uptime}:**\n${time.shortTime(stats.uptime, "sec")}\n`
							+ `**❯ ${lang.meta.statistics.returns.ramUsage}:**\n${bToMB(stats.ram)}`,
							inline: true
						},
						{
							name: leadingSpace,
							value: `${language.replace(lang.meta.statistics.returns.userCount, { "number": stats.users })}\n`
							+ `${language.replace(lang.meta.statistics.returns.guildCount, { "number": stats.guilds })}\n`
							+ `${language.replace(lang.meta.statistics.returns.channelCount, { "number": stats.channels })}\n`
							+ `${language.replace(lang.meta.statistics.returns.voiceConnections, { "number": stats.connections })}`,
							inline: true
						}
					])
				nmsg.edit({ content: null, embeds: [embed] })
			}

			function bToMB(number) {
				return `${((number / 1024) / 1024).toFixed(2)}MB`
			}
		}
	},
	{
		name: "info",
		description: "Gets info about Amanda",
		category: "meta",
		process(cmd, lang) {
			const embed = new Discord.MessageEmbed()
				.setAuthor("Amanda", client.user!.displayAvatarURL({ format: "png", size: 32 })!)
				.setDescription(lang.meta.info.returns.thanks)
				.addFields([
					{
						name: lang.meta.info.returns.creators,
						value: "PapiOphidian#0110 <:bravery:479939311593324557> <:VerifiedDeveloper:699408396591300618> <:EarlySupporter:585638218255564800> <:NitroBadge:421774688507920406> <:boostlvl3:582555022508687370>"
					},
					{
						name: "Code",
						value: `[node.js](https://nodejs.org/) ${process.version} + [discord.js](https://www.npmjs.com/package/discord.js) ${Discord.version}`
					},
					{
						name: "Links",
						value: language.replace(lang.meta.info.returns.links, { "website": `${config.website_protocol}://${config.website_domain}/`, "stats": constants.stats, "server": constants.server, "patreon": constants.patreon, "paypal": constants.paypal }) +
						`\n${language.replace(lang.meta.invite.returns.link, { "link": constants.add })}\nPrivacy Policy: <${constants.baseURL}/to/privacy>\nTodo board: ${config.website_protocol}://${config.website_domain}/to/todo`
					}
				])
				.setColor(constants.standard_embed_color)
			cmd.reply({ embeds: [embed], ephemeral: true })
		}
	},
	{
		name: "git",
		description: "Gets the latest git commits to Amanda",
		category: "meta",
		async process(cmd) {
			await cmd.defer()
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
					const diff =
						`${diffs[index].files.length} file${diffs[index].files.length > 1 ? "s" : ""} changed, ` +
						`${diffs[index].insertions} insertion${diffs[index].insertions > 1 ? "s" : ""}, ` +
						`${diffs[index].deletions} deletion${diffs[index].deletions > 1 ? "s" : ""}.`
					return `\`» ${line.hash.slice(0, 7)}: ${dateString} — ${authorNameMap[line.author_name] || "Unknown"}\`\n` +
									`\`» ${diff}\`\n${line.message}`
				}).join("\n\n") }

			const embed = new Discord.MessageEmbed()
				.setTitle("Git info")
				.addFields([{ name: "Status", value:`On branch ${res.branch}, latest commit ${res.latestCommitHash}` }, { name: `Commits (latest ${limit} entries)`, value: res.logString }])
				.setColor(constants.standard_embed_color)
			return cmd.editReply({ embeds: [embed] })
		}
	},
	{
		name: "help",
		description: "Your average help command",
		category: "meta",
		options: [
			{
				name: "category",
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
				description: "The category to get help with",
				choices: ["meta", ...commands.categories.keys()].map(i => ({ name: i, value: i })),
				required: false
			},
			{
				name: "command",
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
				description: "The command to get help with",
				required: false
			}
		],
		process(cmd, lang) {
			let embed: import("thunderstorm").MessageEmbed
			const category = cmd.options.getString("category", false)
			const command = cmd.options.getString("command", false)
			if (category || command) {
				if (category === "music") {
					embed = new Discord.MessageEmbed()
						.setAuthor("music: command help")
						.setFooter("<> = Required, [] = Optional, | = Or. Do not include <>, [], or | in your input")
						.setColor(constants.standard_embed_color)
					const blacklist = ["soundcloud", "music", "frisky", "debug", "token", "listenmoe", "newgrounds"]
					const audio = commands.cache.filter(c => c.category === "audio" && !blacklist.includes(c.name))
					audio.map(c => {
						const info = getDocs(c)
						if (c.name === "playlist") info.description = "See `/help category: playlist`"
						embed.addField(c.name, `${info.description ? `${info.description}\n` : ""}*Arguments*: ${info.options?.map(i => i.required ? `<${i.name}>` : `[${i.name}]`).join(", ") || "None"}`)
					})
					cmd.reply({ embeds: [embed], ephemeral: true })
				} else {
					const c = commands.cache.find(cm => cm.name === command)
					if (c) {
						const info = getDocs(c)
						embed = new Discord.MessageEmbed()
							.setAuthor(`Help for ${c.name}`)
							.setDescription(`Arguments: ${info.options?.map(i => i.required ? `<${i.name}>` : `[${i.name}]`).join(", ") || "None"}\nDescription: ${info.description}\nCategory: ${c.category}`)
							.setFooter("<> = Required, [] = Optional, | = Or. Do not include <>, [], or | in your input")
							.setColor(constants.standard_embed_color)
						cmd.reply({ embeds: [embed], ephemeral: true })
					} else if (category != "hidden" && commands.categories.get(category || "")) {
						const cat = commands.categories.get(category!)!
						const maxLength = cat.reduce((acc, cur) => Math.max(acc, cur.length), 0)
						embed = new Discord.MessageEmbed()
							.setAuthor(`Command Category: ${category}`)
							.setDescription(
								cat.sort((a, b) => {
									const cmda = commands.cache.get(a)!
									const cmdb = commands.cache.get(b)!
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
									const cm = commands.cache.get(c2)!
									let desc: string
									if (lang[category!] && lang[category!][c2] && !["music", "playlist"].includes(c2)) desc = lang[category!][c2].help.description
									else desc = cm.description
									return `\`${cm.name}${" ​".repeat(maxLength - cm.name.length)}\` ${desc}`
								}).join("\n") +
							`\n\n${lang.meta.help.returns.footer}`)
							.setColor(constants.standard_embed_color)
							.setFooter(lang.meta.help.returns.mobile)
						cmd.reply({ embeds: [embed], ephemeral: true })
					} else {
						embed = new Discord.MessageEmbed().setDescription(language.replace(lang.meta.help.prompts.invalidCommand, { "tag": cmd.user.tag })).setColor(0xB60000)
						cmd.reply({ embeds: [embed], ephemeral: true })
					}
				}
			} else {
				embed = new Discord.MessageEmbed()
					.setAuthor("Command Categories")
					.setDescription(
						`❯ ${Array.from(commands.categories.keys()).filter(c => c != "admin" && c != "hidden").join("\n❯ ")}\n\n${lang.meta.help.returns.main}\n\n${language.replace(lang.meta.help.returns.info, { "link": constants.invite_link_for_help })}`)
					.setColor(constants.standard_embed_color)
				cmd.reply({ embeds: [embed], ephemeral: true })
			}

			function getDocs(c: import("../types").UnpackArray<Parameters<typeof commands["assign"]>["0"]>) {
				let info = { name: c.name, description: c.description, options: c.options }
				if (lang[c.category]) {
					const langcommand = lang[c.category][c.name]
					if (langcommand) info = { name: c.name, description: langcommand.help.description, options: c.options }
				}
				return info
			}
		}
	}
])
