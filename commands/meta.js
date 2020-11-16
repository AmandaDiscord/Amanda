// @ts-check

/** @type {import("node-fetch").default} */
const fetch = require("node-fetch")
const bs = require("buffer-signature")
const fs = require("fs")
const Discord = require("thunderstorm")
const Jimp = require("jimp")
const path = require("path")
const simpleGit = require("simple-git")(__dirname)
const profiler = require("gc-profiler")
const ReactionMenu = require("@amanda/reactionmenu")

const SnowflakeUtil = require("discord.js/src/util/Snowflake")
const Util = require("discord.js/src/util/Util")

const emojis = require("../modules/emojis")

const passthrough = require("../passthrough")
const { client, constants, config, commands, reloadEvent, reloader, games, queues, periodicHistory, ipc } = passthrough

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

let sendStatsTimeout = setTimeout(sendStatsTimeoutFunction, 1000 * 60 * 60 - (Date.now() % (1000 * 60 * 60)))
console.log("added timeout sendStatsTimeout")
function sendStatsTimeoutFunction() {
	sendStats()
	sendStatsTimeout = setTimeout(sendStatsTimeoutFunction, 1000 * 60 * 60)
}
/**
 * @param {Discord.Message} [msg]
 */
async function sendStats(msg) {
	console.log("Sending stats...")
	const stats = await utils.getOwnStats()
	const now = Date.now()
	const myid = client.user.id
	const ramUsageKB = Math.floor(stats.ram / 1024)
	const shard = 0
	await utils.sql.all(
		"INSERT INTO StatLogs (time, id, ramUsageKB, users, guilds, channels, voiceConnections, uptime, shard) \
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
		, [now, myid, ramUsageKB, stats.users, stats.guilds, stats.channels, stats.connections, stats.uptime, shard]
	)
	if (msg) msg.react("👌")
	return console.log("Sent stats.", new Date().toUTCString())
}

async function updateCache() {
	const backgroundRows = await utils.sql.all("SELECT keyID, value FROM SettingsSelf WHERE setting = 'profilebackground'")
	const mineRows = await utils.sql.all("SELECT userID, url FROM BackgroundSync WHERE machineID = ?", config.machine_id)
	const mineMap = new Map(mineRows.map(r => [r.userID, r.url]))
	const updatedPrepared = []
	let updatedQuery = ""
	await Promise.all(backgroundRows.map(async row => {
		const mine = mineMap.get(row.keyID)
		if (!mine || mine !== row.value) {
			let image
			try {
				image = await Jimp.read(row.value)
			} catch (e) {
				// await utils.sql.all("DELETE FROM SettingsSelf WHERE setting = ? AND keyID = ?", ["profilebackground", row.keyID])
				return console.log(`Image cache update for ${row.keyID} failed. Deleted entry`)
			}
			image.cover(800, 500)
			// jimp automatically converts the buffer to the format specified by the file extension
			await image.writeAsync(`./images/backgrounds/cache/${row.keyID}.png`)
			updatedPrepared.push(config.machine_id, row.keyID, row.value)
			if (updatedQuery) updatedQuery += ", "
			updatedQuery += "(?, ?, ?)"
			console.log(`Saved background for ${row.keyID}`)
		}
	}))
	if (updatedPrepared.length) {
		await utils.sql.all(`REPLACE INTO BackgroundSync (machineID, userID, url) VALUES ${updatedQuery}`, updatedPrepared)
		console.log("Background cache update complete")
	} else {
		console.log("No changes to backgrounds since last call")
	}
}
let cacheUpdateTimeout
updateCache()
cacheUpdateTimeout = setTimeout(cacheUpdateTimeoutFunction, 1000 * 60 * 60 * 24 - (Date.now() % (1000 * 60 * 60 * 24)))
console.log("added timeout cacheUpdateTimeout")
ipc.replier.addReceivers([
	["update_background_cache_BACKGROUND_UPDATE_REQUIRED", {
		op: "BACKGROUND_UPDATE_REQUIRED",
		fn: () => {
			updateCache()
		}
	}]
])
function cacheUpdateTimeoutFunction() {
	updateCache()
	cacheUpdateTimeout = setTimeout(cacheUpdateTimeoutFunction, 1000 * 60 * 60 * 24)
}

reloadEvent.once(path.basename(__filename), () => {
	clearTimeout(sendStatsTimeout)
	clearTimeout(cacheUpdateTimeout)
	console.log("removed timeout sendStatsTimeout")
	console.log("removed timeout cacheUpdateTimeout")
})

/**
 * @param {Discord.User} user
 * @param {string} otherid
 */
function getHeartType(user, otherid) {
	// Full hearts for Amanda! Amanda loves everyone.
	if (user.id == client.user.id) return "full"
	// User doesn't love anyone. Sad.
	if (!otherid) return "broken"
	// If we get here, then the user is in a relationship
	return "full"
}

const giverTier1 = 100000
const giverTier2 = 1000000
const giverTier3 = 10000000

/** @type {Array<{ usage: string, description: string, aliases: Array<string>, category: string, example?: string, process: (message?: import("thunderstorm").Message, suffix?: string, lang?: import("@amanda/lang").Lang) => any }>} */
const cmds = [
	{
		usage: "[music|games|gateway|cache]",
		description: "Displays detailed statistics",
		aliases: ["statistics", "stats"],
		category: "meta",
		example: "&stats",
		async process(msg, suffix, lang) {
			const embed = new Discord.MessageEmbed().setColor(constants.standard_embed_color)
			const leadingIdentity = `${client.user.tag} <:online:606664341298872324>\n${config.cluster_id} cluster`
			const leadingSpace = `${emojis.bl}\n​`
			function bothStats(stats, allStats, key) {
				return `${utils.numberComma(allStats[key])} total, _${utils.numberComma(stats[key])} in ${config.cluster_id} cluster_` // SC: U+2004 THREE-PER-EM SPACE
			}
			if (suffix.toLowerCase() == "music") {
				const songsPlayed = periodicHistory.getSize("song_start")
				const qs = passthrough.queues.cache
				/** @type {Array<Array<import("@amanda/discordtypings").VoiceStateData & { user: import("@amanda/discordtypings").UserData }>>} */
				const allStates = await Promise.all(qs.map(q =>
					passthrough.workers.cache.getData({ op: "FILTER_VOICE_STATES", params: { channel_id: q.voiceChannel.id, limit: 30 } })
				))
				const listeningcount = allStates.length
				embed
					.addFields([
						{
							name: leadingIdentity,
							value: `${utils.replace(lang.meta.statistics.returns.songsToday, { "number": utils.numberComma(songsPlayed) })}\n` +
								`${utils.replace(lang.meta.statistics.returns.songsQueued, { "number": utils.numberComma([...queues.cache.values()].reduce((acc, cur) => acc + cur.songs.length, 0)) })}`,
							inline: true
						},
						{
							name: leadingSpace,
							value: `${utils.replace(lang.meta.statistics.returns.voiceConnections, { "number": utils.numberComma(client.lavalink.players.size) })}\n` +
								`${utils.replace(lang.meta.statistics.returns.usersListening, { "number": utils.numberComma(listeningcount) })}`,
							inline: true
						}
					])
				return msg.channel.send(embed)
			} else if (suffix.toLowerCase() == "games") {
				const gamesPlayed = periodicHistory.getSize("game_start")
				embed.addFields([
					{
						name: leadingIdentity,
						value: `${utils.replace(lang.meta.statistics.returns.gamesToday, { "number": utils.numberComma(gamesPlayed) })}\n` +
							`${utils.replace(lang.meta.statistics.returns.gamesInProgress, { "number": utils.numberComma(games.cache.size) })}`,
						inline: true
					},
					{
						name: leadingSpace,
						value: `${utils.replace(lang.meta.statistics.returns.usersPlaying, { "number": utils.numberComma(games.cache.reduce((acc, cur) => acc + cur.receivedAnswers ? cur.receivedAnswers.size : 0, 0)) })}`,
						inline: true
					}
				])
				return msg.channel.send(await utils.contentify(msg.channel, embed))
			} else if (suffix.toLowerCase() == "gc") {
				const allowed = await utils.sql.hasPermission(msg.author, "eval")
				if (!allowed) return
				const ram = process.memoryUsage()
				if (global.gc) {
					profiler.once("gc", info => {
						const now = process.memoryUsage()
						return msg.channel.send(`Garbage Collection completed in ${utils.numberComma(info.duration)}ms.\nrss: ${bToMB(ram.rss)} → ${bToMB(now.rss)}\nheapTotal: ${bToMB(ram.heapTotal)} → ${bToMB(now.heapTotal)}\nheapUsed: ${bToMB(ram.heapUsed)} → ${bToMB(now.heapUsed)}\nexternal: ${bToMB(ram.external)} → ${bToMB(now.external)}\nComputed: ${bToMB(ram.rss - (ram.heapTotal - ram.heapUsed))} → ${bToMB(now.rss - (now.heapTotal - now.heapUsed))}`)
					})
					global.gc()
				} else return msg.channel.send("The global Garbage Collector variable is not exposed")
			} else if (suffix.toLowerCase() == "gateway") {
				const before = Date.now()
				const stats = await passthrough.workers.gateway.getStats()
				const ram = stats.ram.rss - (stats.ram.heapTotal - stats.ram.heapUsed)
				embed
					.addFields([
						{
							name: leadingIdentity,
							value: `**❯ ${lang.meta.statistics.returns.latency}:**\n${utils.numberComma(Date.now() - before)}ms\n`
							+ `**❯ ${lang.meta.statistics.returns.uptime}:**\n${utils.shortTime(stats.uptime, "sec")}\n`
							+ `**❯ ${lang.meta.statistics.returns.ramUsage}:**\n${bToMB(ram)}\n`,
							inline: true
						},
						{
							name: leadingSpace,
							value: `**❯ Shards:**\n[${stats.shards.join(", ")}]`,
							inline: true
						}
					])
				return msg.channel.send(await utils.contentify(msg.channel, embed))
			} else if (suffix.toLowerCase() == "cache") {
				const before = Date.now()
				const stats = await passthrough.workers.cache.getStats()
				const ram = stats.ram.rss - (stats.ram.heapTotal - stats.ram.heapUsed)
				embed
					.addFields([
						{
							name: leadingIdentity,
							value: `**❯ ${lang.meta.statistics.returns.latency}:**\n${utils.numberComma(Date.now() - before)}ms\n`
							+ `**❯ ${lang.meta.statistics.returns.uptime}:**\n${utils.shortTime(stats.uptime, "sec")}\n`
							+ `**❯ ${lang.meta.statistics.returns.ramUsage}:**\n${bToMB(ram)}\n`,
							inline: true
						},
						{
							name: leadingSpace,
							value: `**❯ Current Operation Count:**\n${utils.numberComma(stats.activeOPs)}\n`
							+ `**❯ Total Operations:**\n${utils.numberComma(stats.totalOPs)}`,
							inline: true
						}
					])
				return msg.channel.send(await utils.contentify(msg.channel, embed))
			} else {
				const stats = await utils.getOwnStats()
				const allStats = stats
				const nmsg = await msg.channel.send(lang.meta.statistics.prompts.slow)
				embed
					.addFields([
						{
							name: leadingIdentity,
							value: `**❯ ${lang.meta.statistics.returns.latency}:**\n${utils.numberComma(nmsg.createdTimestamp - msg.createdTimestamp)}ms\n`
							+ `**❯ ${lang.meta.statistics.returns.uptime}:**\n${utils.shortTime(stats.uptime, "sec")}\n`
							+ `**❯ ${lang.meta.statistics.returns.ramUsage}:**\n${bToMB(stats.ram)}`,
							inline: true
						},
						{
							name: leadingSpace,
							value: `${utils.replace(lang.meta.statistics.returns.userCount, { "number": bothStats(stats, allStats, "users") })}\n`
							+ `${utils.replace(lang.meta.statistics.returns.guildCount, { "number": bothStats(stats, allStats, "guilds") })}\n`
							+ `${utils.replace(lang.meta.statistics.returns.channelCount, { "number": bothStats(stats, allStats, "channels") })}\n`
							+ `${utils.replace(lang.meta.statistics.returns.voiceConnections, { "number": bothStats(stats, allStats, "connections") })}`,
							inline: true
						}
					])
				nmsg.edit(await utils.contentify(msg.channel, embed))
			}
			function bToMB(number) {
				return `${((number / 1024) / 1024).toFixed(2)}MB`
			}
		}
	},
	{
		usage: "None",
		description: "Gets latency to Discord",
		aliases: ["ping", "pong"],
		category: "meta",
		example: "&ping",
		async process(msg, suffix, lang) {
			const array = ["So young... So damaged...", "We've all got no where to go...", "You think you have time...", "Only answers to those who have known true despair...", "Hopeless...", "Only I know what will come tomorrow...", "So dark... So deep... The secrets that you keep...", "Truth is false...", "Despair..."]
			const message = utils.arrayRandom(array)
			const nmsg = await msg.channel.send(message)
			const embed = new Discord.MessageEmbed().setAuthor(lang.meta.ping.returns.pong).addFields([{ name: lang.meta.ping.returns.latency, value: `${utils.numberComma(nmsg.createdTimestamp - msg.createdTimestamp)}ms`, inline: true }]).setFooter(lang.meta.ping.returns.footer).setColor(constants.standard_embed_color)
			const content = await utils.contentify(msg.channel, embed)
			nmsg.edit(content)
		}
	},
	{
		usage: "None",
		description: "",
		aliases: ["forcestatupdate"],
		category: "admin",
		example: "&forcestatupdate",
		async process(msg) {
			const permissions = await utils.sql.hasPermission(msg.author, "eval")
			if (!permissions) return
			sendStats(msg)
		}
	},
	{
		usage: "None",
		description: "",
		aliases: ["restartnotify"],
		category: "admin",
		example: "&restartnotify",
		async process(msg, suffix, lang) {
			await utils.sql.all("REPLACE INTO RestartNotify VALUES (?, ?, ?)", [client.user.id, msg.author.id, msg.channel.id])
			if (!(await utils.cacheManager.channels.hasPermissions({ id: msg.channel.id, guild_id: msg.guild ? msg.guild.id : undefined }, 0x00000040))) return msg.channel.send(lang.admin.restartnotify.returns.confirmation)
			msg.react("✅")
		}
	},
	{
		usage: "None",
		description: "Add Amanda to a server",
		aliases: ["invite", "inv"],
		category: "meta",
		example: "&invite",
		async process(msg, suffix, lang) {
			const embed = new Discord.MessageEmbed()
				.setTitle(lang.meta.invite.returns.invited)
				.setDescription(`${lang.meta.invite.returns.notice}\n${utils.replace(lang.meta.invite.returns.link, { "link": constants.add })}`)
				.setColor(constants.standard_embed_color)
			msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	},
	{
		usage: "None",
		description: "Displays information about Amanda",
		aliases: ["info", "inf"],
		category: "meta",
		example: "&info",
		async process(msg, suffix, lang) {
			const [c1, c2] = await Promise.all([
				utils.cacheManager.users.get("320067006521147393", true, true),
				utils.cacheManager.users.get("176580265294954507", true, true)
			])
			const embed = new Discord.MessageEmbed()
				.setAuthor("Amanda", client.user.displayAvatarURL({ format: "png", size: 32 }))
				.setDescription(lang.meta.info.returns.thanks)
				.addFields([
					{
						name: lang.meta.info.returns.creators,
						value: `${c1.tag} ${utils.userFlagEmojis(c1).join(" ")} <:NitroBadge:421774688507920406>\n` +
							`${c2.tag} ${utils.userFlagEmojis(c2).join(" ")} <:NitroBadge:421774688507920406> <:boostlvl4:582555056369434635>`
					},
					{
						name: "Code",
						value: `[node.js](https://nodejs.org/) ${process.version} + [discord.js](https://www.npmjs.com/package/discord.js) 11.6.4 (ThunderStorm)`
					},
					{
						name: "Links",
						value: utils.replace(lang.meta.info.returns.links, { "website": `${config.website_protocol}://${config.website_domain}/`, "stats": constants.stats, "server": constants.server, "patreon": constants.patreon, "paypal": constants.paypal })
					}
				])
				.setColor(constants.standard_embed_color)
			return msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	},
	{
		usage: "None",
		description: "Get information on how to donate",
		aliases: ["donate", "patreon"],
		category: "meta",
		example: "&donate",
		async process(msg, suffix, lang) {
			const embed = new Discord.MessageEmbed()
				.setColor(constants.standard_embed_color)
				.setTitle(lang.meta.donate.returns.intro)
				.setDescription(utils.replace(lang.meta.donate.returns.description, { "server": constants.server, "patreon": constants.patreon, "paypal": constants.paypal }))
			return msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	},
	{
		usage: "None",
		description: "Gets the latest git commits to Amanda",
		aliases: ["commits", "commit", "git", "changes", "changelog"],
		category: "meta",
		example: "&git",
		async process(msg) {
			await msg.channel.sendTyping()
			const limit = 5
			const authorNameMap = {
				"Cadence Ember": "Cadence",
				"Papi": "PapiOphidian"
			}
			const res = await new Promise((r) => {
				simpleGit.status((err, status) => {
					simpleGit.log({ "--no-decorate": null }, (err2, log) => {
						Promise.all(Array(limit).fill(undefined).map((_, i) => new Promise(resolve => {
							simpleGit.diffSummary([log.all[i + 1].hash, log.all[i].hash], (err3, diff) => {
								resolve(diff)
							})
						}))).then(diffs => {
							const result = { branch: status.current, latestCommitHash: log.latest.hash.slice(0, 7), logString:
							log.all.slice(0, limit).map((line, index) => {
								const date = new Date(line.date)
								const dateString = `${date.toDateString()} @ ${date.toTimeString().split(":").slice(0, 2).join(":")}`
								const diff =
									`${diffs[index].files.length} files changed, ` +
									`${diffs[index].insertions} insertions, ` +
									`${diffs[index].deletions} deletions.`
								return `\`» ${line.hash.slice(0, 7)}: ${dateString} — ${authorNameMap[line.author_name] || "Unknown"}\`\n` +
												`\`» ${diff}\`\n${line.message}`
							}).join("\n\n") }
							r(result)
						})
					})
				})
			})
			const embed = new Discord.MessageEmbed()
				.setTitle("Git info")
				.addFields([{ name: "Status", value:`On branch ${res.branch}, latest commit ${res.latestCommitHash}` }, { name: `Commits (latest ${limit} entries)`, value: res.logString }])
				.setColor(constants.standard_embed_color)
			return msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	},
	{
		usage: "None",
		description: "Details Amanda's privacy statement",
		aliases: ["privacy"],
		category: "meta",
		example: "&privacy",
		process(msg, suffix, lang) {
			return msg.channel.send(`<${constants.baseURL}/to/privacy>`)
		}
	},
	{
		usage: "[user]",
		description: "Provides information about a user",
		aliases: ["user"],
		category: "meta",
		example: "&user PapiOphidian",
		async process(msg, suffix, lang) {
			let user, member
			if (await utils.cacheManager.channels.typeOf(msg.channel) === "text") {
				member = await utils.cacheManager.members.find(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix, true)
			if (!user) return msg.channel.send(utils.replace(lang.meta.user.prompts.invalidUser, { "username": msg.author.username }))
			const embed = new Discord.MessageEmbed().setColor(constants.standard_embed_color)
			const createdAt = SnowflakeUtil.deconstruct(user.id).date
			embed.addFields([{ name: "User ID", value: user.id }, { name: "Account created at:", value: createdAt.toUTCString() }])
			if (member) {
				const guildJoinedTime = member.joinedAt.toUTCString()
				embed.addFields({ name: "Joined at:", value: guildJoinedTime })
			}
			let status = ""
			/* const activity = `*${user.activeOn}*\n`
			if (user.presence.activity && user.presence.activity.type == "STREAMING") {
				activity += `Streaming [${user.presence.activity.name}](${user.presence.activity.url})`
				if (user.presence.activity.details) activity += `<:RichPresence:477313641146744842>\nPlaying ${user.presence.activity.details}`
				status = "<:streaming:606815351967318019>"
			} else if (user.presence.activity) {
				if (user.presence.activity.name.toLowerCase() == "custom status") activity += `**${user.presence.activity.name}**`
				else activity += `${user.activityPrefix} **${user.presence.activity.name}**`
				if (user.presence.activity.details) activity += `<:RichPresence:477313641146744842>\n${user.presence.activity.details}`
				if (user.presence.activity.state && user.presence.activity.name == "Spotify") activity += `\nby ${user.presence.activity.state}`
				else if (user.presence.activity.state) activity += `\n${user.presence.activity.state}`
			}*/
			if (user.bot) {
				if (user.flags && (user.flags & 1 << 16) == 1 << 16) status = "<:VerifiedBot:719645152003489912>"
				else status = "<:bot:412413027565174787>"
			}
			embed.setThumbnail(user.displayAvatarURL({ format: "png", size: 256, dynamic: true }))
			embed.addFields({ name: "Avatar URL:", value: `[Click Here](${user.displayAvatarURL({ format: "png", size: 2048, dynamic: true })})` })
			embed.setTitle(`${user.tag} ${status}\n${utils.userFlagEmojis(user).join(" ")}`)
			// if (activity) embed.setDescription(activity)
			return msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	},
	{
		usage: "[user]",
		description: "Gets a user's avatar",
		aliases: ["avatar", "pfp"],
		category: "meta",
		example: "&avatar PapiOphidian",
		async process(msg, suffix, lang) {
			let canEmbedLinks = true
			if (!(await utils.cacheManager.channels.hasPermissions({ id: msg.channel.id, guild_id: msg.guild ? msg.guild.id : undefined }, 0x00004000))) canEmbedLinks = false
			/** @type {Discord.User} */
			let user = null
			if (msg.channel.type == "text") {
				const member = await utils.cacheManager.members.find(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix, true)
			if (!user) return msg.channel.send(utils.replace(lang.meta.avatar.prompts.invalidUser, { "username": msg.author.username }))
			const url = user.displayAvatarURL({ format: "png", size: 2048, dynamic: true })
			if (canEmbedLinks) {
				const embed = new Discord.MessageEmbed()
					.setImage(url)
					.setColor(constants.standard_embed_color)
				msg.channel.send(embed)
			} else msg.channel.send(url)
		}
	},
	/* {
		usage: "None",
		description: "Gets a server's icon",
		aliases: ["icon"],
		category: "meta",
		example: "&icon",
		async process(msg, suffix, lang) {
			if (await utils.cacheManager.channels.typeOf() === "dm") return msg.channel.send(utils.replace(lang.meta.icon.prompts.guildOnly, { "username": msg.author.username }))
			const url = msg.guild.iconURL({ format: "png", size: 2048, dynamic: true })
			const canEmbedLinks = msg.channel.utils.cacheManager.users.find(client.user).has("EMBED_LINKS")
			if (canEmbedLinks) {
				const embed = new Discord.MessageEmbed()
					.setImage(url)
					.setColor(constants.standard_embed_color)
				msg.channel.send(embed)
			} else msg.channel.send(url)
		}
	},*/
	{
		usage: "None",
		description: "See Amanda's to-do list",
		aliases: ["todo", "trello", "tasks"],
		category: "meta",
		example: "&todo",
		process(msg, suffix) {
			msg.channel.send(`Todo board: ${config.website_protocol}://${config.website_domain}/to/todo`)
		}
	},
	{
		usage: "<emoji>",
		description: "Makes an emoji bigger",
		aliases: ["wumbo"],
		category: "meta",
		example: "&wumbo :amandathink:",
		async process(msg, suffix, lang) {
			if (!suffix) return msg.channel.send(utils.replace(lang.meta.wumbo.prompts.invalidEmoji, { "username": msg.author.username }))
			const emoji = Util.parseEmoji(suffix)
			if (emoji == null) return msg.channel.send(utils.replace(lang.meta.wumbo.prompts.invalidEmoji, { "username": msg.author.username }))
			const url = utils.emojiURL(emoji.id, emoji.animated)
			const embed = new Discord.MessageEmbed()
				.setImage(url)
				.setColor(constants.standard_embed_color)
			if (!(await utils.cacheManager.channels.hasPermissions({ id: msg.channel.id, guild_id: msg.guild ? msg.guild.id : undefined }, 0x00004000))) return msg.channel.send(url)
			return msg.channel.send(embed)
		}
	},
	{
		usage: "[user]",
		description: "Get profile information about someone",
		aliases: ["profile"],
		category: "meta",
		example: "&profile PapiOphidian",
		async process(msg, suffix, lang) {
			let user, member
			if (!(await utils.cacheManager.channels.hasPermissions({ id: msg.channel.id, guild_id: msg.guild ? msg.guild.id : undefined }, 0x00008000))) return msg.channel.send(lang.meta.profile.prompts.permissionDenied)
			if (suffix.indexOf("--light") != -1) suffix = suffix.replace("--light", "")
			if (msg.channel.type == "text") {
				member = await utils.cacheManager.members.find(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.cacheManager.users.find(msg, suffix, true)
			if (!user) return msg.channel.send(utils.replace(lang.meta.profile.prompts.invalidUser, { "username": msg.author.username }))
			await msg.channel.sendTyping()

			let themeoverlay = "profile"
			const themedata = await utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID =? AND setting =?", [user.id, "profiletheme"])
			if (themedata && themedata.value && themedata.value == "light") themeoverlay = "profile-light"

			const [isOwner, isPremium, money, info, avatar, images, fonts] = await Promise.all([
				utils.sql.hasPermission(user, "owner"),
				utils.sql.get("SELECT * FROM Premium WHERE userID =?", user.id),
				utils.coinsManager.getRow(user.id),
				utils.sql.get("SELECT * FROM Couples WHERE user1 =? OR user2 =?", [user.id, user.id]),
				Jimp.read(user.displayAvatarURL({ format: "png", size: 128 })),
				utils.jimpStores.images.getAll(["canvas", "canvas-vicinity", "canvas-sakura", "profile", "profile-light", "old-profile", "old-profile-light", "heart-full", "heart-broken", "badge-developer", "badge-donator", "circle-mask", "profile-background-mask", "badge-hunter", "badge-booster", "badge-giver1", "badge-giver2", "badge-giver3", "discoin"]),
				utils.jimpStores.fonts.getAll(["whitney-25", "whitney-20-2", "whitney-25-black", "whitney-20-2-black"])
			])

			const otherid = info ? (info.user1 === user.id ? info.user2 : info.user1) : null
			let other
			if (otherid) other = await utils.cacheManager.users.get(otherid, true, true)

			avatar.resize(111, 111)

			const heartType = getHeartType(user, otherid)
			const heart = images.get(`heart-${heartType}`)

			/** @type {string} */
			let badge
			if (isOwner) badge = "badge-developer"
			else if (isPremium) badge = "badge-donator"
			/** @type {import("snowtransfer/src/methods/Guilds").GuildMember} */
			let mem
			const memberFetchTimeout = 2000
			try {
				const TProm = new Promise((_, reject) => {
					setTimeout(() => {
						if (!mem || mem && !mem.roles) return reject(new Error("IPC fetch timeout"))
					}, memberFetchTimeout)
				})
				mem = await Promise.race([utils.cacheManager.members.get(user.id, "475599038536744960", true, false), TProm])
			} catch(e) {
				mem = { roles: [] }
			}
			let boosting, hunter
			if (mem) {
				boosting = mem.roles.includes("613685290938138625")
				hunter = mem.roles.includes("497586624390234112")
			}
			/** @type {import("jimp")} */
			let badgeImage
			if (badge) badgeImage = images.get(badge)
			let giverImage
			if (money.givencoins >= giverTier3) giverImage = images.get("badge-giver3").clone()
			else if (money.givencoins >= giverTier2) giverImage = images.get("badge-giver2").clone()
			else if (money.givencoins >= giverTier1) giverImage = images.get("badge-giver1").clone()


			async function getDefaultBG() {
				const attempt = await utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID =? AND setting =?", [user.id, "defaultprofilebackground"])
				if (attempt && attempt.value && attempt.value != "default") return images.get(`canvas-${attempt.value}`).clone()
				else return images.get("canvas").clone()
			}

			async function getOverlay() {
				const attempt = await utils.sql.get("SELECT * FROM SettingsSelf WHERE keyID =? AND setting =?", [user.id, "profilestyle"])
				if (attempt && attempt.value && attempt.value != "new") return { style: "old", image: images.get(`old-${themeoverlay}`).clone() }
				else return { style: "new", image: images.get(themeoverlay).clone() }
			}

			const job = await getOverlay()

			/** @type {import("jimp")} */
			let canvas

			if (isOwner || isPremium) {
				try {
					canvas = await Jimp.read(`./images/backgrounds/cache/${user.id}.png`)
				} catch (e) {
					canvas = await getDefaultBG()
				}
			} else canvas = await getDefaultBG()

			const [font, font2, font_black, font2_black] = [fonts.get("whitney-25"), fonts.get("whitney-20-2"), fonts.get("whitney-25-black"), fonts.get("whitney-20-2-black")]

			function buildOldProfile() {
				// badge coords [219, 289, 359, 419, 489] (increments of 70)
				canvas.composite(job.image, 0, 0)
				canvas.composite(avatar, 65, 61)
				if (badgeImage) canvas.composite(badgeImage, 219, 120)
				if (!badgeImage && giverImage) canvas.composite(giverImage, 219, 120)
				else if (badgeImage && giverImage) canvas.composite(giverImage, 289, 120)
				if (boosting) {
					if (!badge && !giverImage) canvas.composite(images.get("badge-booster").resize(50, 50), 219, 120)
					else if (!badge || !giverImage) canvas.composite(images.get("badge-booster").resize(50, 50), 289, 120)
					else canvas.composite(images.get("badge-booster").resize(50, 50), 349, 120)
				}

				canvas.print(themeoverlay == "profile" ? font : font_black, 219, 58, user.username.length > 42 ? `${user.username.slice(0, 40)}...` : user.username)
				canvas.print(themeoverlay == "profile" ? font2 : font2_black, 219, 90, `#${user.discriminator}`)
				canvas.composite(images.get("discoin"), 62, 215)
				canvas.print(themeoverlay == "profile" ? font2 : font2_black, 106, 222, utils.numberComma(money.coins))
				canvas.composite(heart, 62, 259)
				canvas.print(themeoverlay == "profile" ? font2 : font2_black, 106, 265, user.id == client.user.id ? "You <3" : other ? other.tag.length > 42 ? `${other.tag.slice(0, 40)}...` : other.tag : "Nobody, yet")

				let huntercoords = [219, 125]
				if (badge && boosting && giverImage) huntercoords = [419, 125]
				else if (badge && (boosting || giverImage)) huntercoords = [359, 125]
				else if (badge || boosting || giverImage) huntercoords = [289, 125]
				if (hunter) canvas.composite(images.get("badge-hunter").resize(50, 50), huntercoords[0], huntercoords[1])
			}

			function buildNewProfile() {
				canvas.mask(images.get("profile-background-mask"), 0, 0)
				canvas.composite(job.image, 0, 0)
				avatar.mask(images.get("circle-mask"), 0, 0)
				canvas.composite(avatar, 32, 85)
				if (badgeImage) canvas.composite(badgeImage, 166, 113)
				if (boosting) {
					if (!badge) canvas.composite(images.get("badge-booster").resize(34, 34), 166, 115)
					else canvas.composite(images.get("badge-booster").resize(34, 34), 216, 115)
				}

				canvas.print(themeoverlay == "profile" ? font : font_black, 508, 72, user.username.length > 22 ? `${user.username.slice(0, 19)}...` : user.username)
				canvas.print(themeoverlay == "profile" ? font2 : font2_black, 508, 104, `#${user.discriminator}`)
				canvas.composite(images.get("discoin"), 508, 156)
				canvas.print(themeoverlay == "profile" ? font2 : font2_black, 550, 163, utils.numberComma(money.coins))
				canvas.composite(heart, 508, 207)
				canvas.print(themeoverlay == "profile" ? font2 : font2_black, 550, 213, user.id == client.user.id ? "You <3" : other ? other.tag.length > 22 ? `${other.tag.slice(0, 19)}...` : other.tag : "Nobody, yet")
				if (hunter) {
					canvas.composite(images.get("badge-hunter").resize(34, 34), 508, 250)
					canvas.print(themeoverlay == "profile" ? font2 : font2_black, 550, 260, "Amanda Bug Catcher")
				}
				if (giverImage) canvas.composite(giverImage, 595, 370)
			}

			if (job.style == "old") buildOldProfile()
			else buildNewProfile()

			const buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			const image = new Discord.MessageAttachment(buffer, "profile.png")
			return msg.channel.send({ file: image })
		}
	},
	{
		usage: "<self|server> <view|setting name> [value]",
		description: "Modify settings Amanda will use for yourself or server wide",
		aliases: ["settings", "setting"],
		category: "configuration",
		example: "&settings self lang es",
		async process(msg, suffix, lang) {
			const args = suffix.split(" ")
			if ((await utils.cacheManager.channels.typeOf(msg.channel)) === "dm") if (args[0].toLowerCase() == "server") return msg.channel.send(lang.configuration.settings.prompts.cantModifyInDM)

			/** @type {Object.<string, { type: string, default: string, scope: Array<string> | string }>} */
			const settings = {
				"waifualert": {
					type: "boolean",
					default: "1",
					scope: ["self", "server"]
				},
				"gamblingalert": {
					type: "boolean",
					default: "1",
					scope: ["self", "server"]
				},
				"profilebackground": {
					type: "string",
					default: `[unset] (${lang.configuration.settings.prompts.backgroundRecommended})`,
					scope: "self"
				},
				"profiletheme": {
					type: "string",
					default: "dark",
					scope: "self"
				},
				"profilestyle": {
					type: "string",
					default: "new",
					scope: "self"
				},
				"language": {
					type: "string",
					default: "en-us",
					scope: ["self", "server"]
				}
			}

			const tableNames = { self: "SettingsSelf", server: "SettingsGuild" }

			let scope = args[0].toLowerCase()
			scope = Util.escapeMarkdown(scope)
			if (!["self", "server"].includes(scope)) return msg.channel.send(lang.configuration.settings.prompts.invalidSyntaxScope)
			const tableName = tableNames[scope]
			const keyID = scope == "self" ? msg.author.id : msg.guild.id

			let settingName = args[1] ? args[1].toLowerCase() : ""
			settingName = Util.escapeMarkdown(settingName)
			if (args[1] == "view") {
				const all = await utils.sql.all(`SELECT * FROM ${tableName} WHERE keyID =?`, keyID)
				if (all.length == 0) return msg.channel.send(utils.replace(lang.configuration.settings.prompts.noSettings, { "scope": scope }))
				return msg.channel.send(all.map(a => `${a.setting}: ${a.value}`).join("\n"))
			}

			if (scope == "server") {
				const bool = await utils.cacheManager.members.hasPermission(msg.author.id, msg.guild.id, "MANAGE_GUILD")
				if (!bool) return msg.channel.send(lang.configuration.settings.prompts.manageServer)
			}

			const setting = settings[settingName]
			if (!setting) return msg.channel.send(utils.replace(lang.configuration.settings.prompts.invalidSyntaxName, { "usage": lang.configuration.settings.help.usage, "settings": Object.keys(settings).filter(k => settings[k].scope.includes(scope)).map(k => `\`${k}\``).join(", ") }))
			if (!setting.scope.includes(scope)) return msg.channel.send(utils.replace(lang.configuration.settings.prompts.invalidSettingScope, { "setting": settingName, "scope": scope }))

			let value = args[2]
			if (!value) {
				const row = await utils.sql.get(`SELECT value FROM ${tableName} WHERE keyID = ? AND setting = ?`, [keyID, settingName])
				if (scope == "server") {
					value = row ? row.value : setting.default
					if (setting.type == "boolean") value = `${(!!+value)}`
					if (row) return msg.channel.send(utils.replace(lang.configuration.settings.prompts.currentValueServer, { "setting": settingName, "value": value }))
					else return msg.channel.send(utils.replace(lang.configuration.settings.prompts.currentValueInherited, { "setting": settingName, "value": value }))
				} else if (scope == "self") {
					let serverRow
					if (msg.channel.type == "text") serverRow = await utils.sql.get("SELECT value FROM SettingsGuild WHERE keyID = ? AND setting = ?", [msg.guild.id, settingName])
					let values = [
						setting.default,
						serverRow ? serverRow.value : null,
						row ? row.value : null
					]
					if (setting.type == "boolean") values = values.map(v => v != null ? !!+v : v)
					const finalValue = values.reduce((acc, cur) => (cur != null ? cur : acc), "[no default]")
					return msg.channel.send(
						`Default value: ${values[0]}\n`
						+ `Server value: ${values[1] != null ? values[1] : "[unset]"}\n`
						+ `Your value: ${values[2] != null ? values[2] : "[unset]"}\n`
						+ `Computed value: ${finalValue}`
					)
				}
			}

			if (value === "null") {
				if (settingName == "profilebackground") {
					try {
						await fs.promises.unlink(`./images/backgrounds/cache/${msg.author.id}.png`)
						ipc.replier.sendBackgroundUpdateRequired()
					} catch (e) {
						return msg.channel.send(lang.configuration.settings.prompts.noBackground)
					}
				}
				await utils.sql.all(`DELETE FROM ${tableName} WHERE keyID = ? AND setting = ?`, [keyID, settingName])
				return msg.channel.send(lang.configuration.settings.returns.deleted)
			}

			if (settingName == "profilebackground") {
				await msg.channel.sendTyping()
				const [isEval, isPremium] = await Promise.all([
					utils.sql.hasPermission(msg.author, "owner"),
					utils.sql.get("SELECT * FROM Premium WHERE userID =?", msg.author.id)
				])
				let allowed = false
				if (isEval) allowed = true
				if (isPremium) allowed = true
				const link = value.startsWith("http")
				if (!allowed && link) return msg.channel.send(lang.configuration.settings.prompts.donorRequired)
				if (!link) {
					const choices = ["default", "vicinity", "sakura"]
					if (!choices.includes(value)) return msg.channel.send(`${msg.author.username}, you can only choose a background of ${choices.join(" or ")}`)
					await utils.sql.all(`REPLACE INTO ${tableName} (keyID, setting, value) VALUES (?, ?, ?)`, [keyID, "defaultprofilebackground", value])
					return msg.channel.send(lang.configuration.settings.returns.updated)
				}
				let data
				try {
					data = await fetch(value).then(d => d.buffer())
				} catch (e) {
					console.log(`Failed to fetch new background URL in settings command: ${value}`)
					return msg.channel.send(lang.configuration.settings.prompts.invalidLink)
				}
				const type = bs.identify(data)
				if (!["image/png", "image/jpeg"].includes(type.mimeType)) return msg.channel.send("You may only set a background of a PNG or a JPEG")
				const image = await Jimp.read(data)
				image.cover(800, 500)
				const buffer = await image.getBufferAsync(Jimp.MIME_PNG)
				await fs.promises.writeFile(`./images/backgrounds/cache/${msg.author.id}.png`, buffer)
				await utils.sql.all(`REPLACE INTO ${tableName} (keyID, setting, value) VALUES (?, ?, ?)`, [keyID, settingName, value])
				await utils.sql.all("REPLACE INTO BackgroundSync (machineID, userID, url) VALUES (?, ?, ?)", [config.machine_id, keyID, value])
				ipc.replier.sendBackgroundUpdateRequired()
				return msg.channel.send(lang.configuration.settings.returns.updated)
			}

			if (settingName == "profiletheme") {
				const choices = ["dark", "light"]
				if (!choices.includes(value)) return msg.channel.send(`${msg.author.username}, you can only choose a theme of ${choices.join(" or ")}`)
				await utils.sql.all(`REPLACE INTO ${tableName} (keyID, setting, value) VALUES (?, ?, ?)`, [keyID, "profiletheme", value])
				return msg.channel.send(lang.configuration.settings.returns.updated)
			}

			if (settingName == "profilestyle") {
				const choices = ["new", "old"]
				if (!choices.includes(value)) return msg.channel.send(`${msg.author.username}, you can only choose a style of ${choices.join(" or ")}`)
				await utils.sql.all(`REPLACE INTO ${tableName} (keyID, setting, value) VALUES (?, ?, ?)`, [keyID, "profilestyle", value])
				return msg.channel.send(lang.configuration.settings.returns.updated)
			}

			if (settingName == "language") {
				const codes = ["en-us", "en-owo", "es", "nl", "pl"]
				if (!codes.includes(value)) return msg.channel.send(utils.replace(lang.configuration.settings.prompts.invalidLangCode, { "username": msg.author.username, "codes": `\n${codes.map(c => `\`${c}\``).join(", ")}` }))
				await utils.sql.all(`REPLACE INTO ${tableName} (keyID, setting, value) VALUES (?, ?, ?)`, [keyID, settingName, value])
				const Lang = require("@amanda/lang")
				const newlang = Lang[value.replace("-", "_")] || Lang.en_us
				return msg.channel.send(newlang.configuration.settings.returns.updated)
			}

			if (setting.type == "boolean") {
				value = args[2].toLowerCase()
				if (!["true", "false"].includes(value)) return msg.channel.send(utils.replace(lang.configuration.settings.prompts.invalidSyntaxBoolean, { "setting": settingName, "value": value }))
				const value_result = args[2] == "true" ? "1" : "0"
				await utils.sql.all(`REPLACE INTO ${tableName} (keyID, setting, value) VALUES (?, ?, ?)`, [keyID, settingName, value_result])
				return msg.channel.send(lang.configuration.settings.returns.updated)

			} else if (setting.type == "string") {
				value = args[2].toLowerCase()
				if (value.length > 50) return msg.channel.send(lang.configuration.settings.prompts.tooLong)
				await utils.sql.all(`REPLACE INTO ${tableName} (keyID, setting, value) VALUES (?, ?, ?)`, [keyID, settingName, value])
				return msg.channel.send(lang.configuration.settings.returns.updated)

			} else throw new Error(`Invalid reference data type for setting \`${settingName}\``)
		}
	},

	{
		usage: "<code>",
		description: "Set the language that Amanda will use to talk to you",
		aliases: ["language", "lang"],
		category: "configuration",
		example: "&language es",
		process(msg, suffix, lang) {
			commands.cache.get("settings").process(msg, `self language ${suffix}`, lang)
		}
	},

	{
		usage: "<code>",
		description: "Set the language that Amanda will use in your server",
		aliases: ["serverlanguage", "serverlang"],
		category: "configuration",
		example: "&serverlanguage es",
		process(msg, suffix, lang) {
			commands.cache.get("settings").process(msg, `server language ${suffix}`, lang)
		}
	},

	{
		usage: "<url>",
		description: "Set the background displayed on &profile",
		aliases: ["background", "profilebackground"],
		category: "configuration",
		example: "&background https://cdn.discordapp.com/attachments/586533548035538954/586533639509114880/vicinity.jpg",
		process(msg, suffix, lang) {
			commands.cache.get("settings").process(msg, `self profilebackground ${suffix}`, lang)
		}
	},

	{
		usage: "[command|category]",
		description: "Your average help command",
		aliases: ["help", "h", "commands", "cmds"],
		category: "meta",
		example: "&help audio",
		async process(msg, suffix, lang) {
			let embed
			if (suffix) {
				suffix = suffix.toLowerCase()
				if (suffix == "music" || suffix == "m") {
					embed = new Discord.MessageEmbed()
						.setAuthor("&music: command help (aliases: music, m)")
						.addFields([
							{
								name: "play",
								value: "Play a song or add it to the end of the queue. Use any YouTube video or playlist URL or video name as an argument.\n`&music play https://youtube.com/watch?v=e53GDo-wnSs` or\n`&music play https://soundcloud.com/luisfonsiofficial/despacito` or\n`&music play despacito`"
							},
							{
								name: "insert",
								value: "Works the same as play, but inserts the song at the start of the queue instead of at the end.\n`&music insert https://youtube.com/watch?v=e53GDo-wnSs`"
							},
							{
								name: "now",
								value: "Show the current song.\n`&music now`"
							},
							{
								name: "pause",
								value: "Pause playback.\n`&music pause`"
							},
							{
								name: "resume",
								value: "Resume playback. (Unpause.)\n`&music resume`"
							},
							{
								name: "info",
								value: "Shows information about the current song/Frisky station\n`&music info`"
							},
							{
								name: "related [play|insert] [index]",
								value: "Show videos related to what's currently playing. Specify either `play` or `insert` and an index number to queue that song.\
												`\n&music related` (shows related songs)\
												`\n&music rel play 8` (adds related song #8 to the end of the queue)"
							},
							{
								name: "auto",
								value: "Enable or disable auto mode.\
												\nWhen auto mode is enabled, when the end of the queue is reached, the top recommended song will be queued automatically, and so music will play endlessly.\
												\n`&music auto`"
							},
							{
								name: "queue [remove|clear] [index]",
								value: "Display or edit the current queue.\
												\n`&music queue`\
												\n`&music queue remove 2`"
							},
							{
								name: "skip",
								value: "Skip the current song and move to the next item in the queue.\n`&music skip`"
							},
							{
								name: "stop",
								value: "Empty the queue and leave the voice channel.\n`&music stop`"
							},
							{
								name: "audit",
								value: "Show an audit log of important actions done to a server's queue"
							},
							{
								name: "playlist",
								value: "Manage playlists. Try `&help playlist` for more info."
							}
						])
						.setFooter("<> = Required, [] = Optional, | = Or. Do not include <>, [], or | in your input")
						.setColor(constants.standard_embed_color)
					msg.channel.send(await utils.contentify(msg.channel, embed))
				} else if (suffix.includes("playlist") || suffix == "pl") {
					embed = new Discord.MessageEmbed()
						.setAuthor("&music playlist: command help (aliases: playlist, playlists, pl)")
						.setDescription("All playlist commands begin with `&music playlist` followed by the name of a playlist. \
														If the playlist name does not exist, you will be asked if you would like to create a new playlist with that name.\
														\nNote that using `add`, `remove`, `move`, `import` and `delete` require you to be the owner (creator) of a playlist.")
						.addFields([
							{
								name: "show",
								value: "Show a list of all playlists.\n`&music playlist show`"
							},
							{
								name: "(just a playlist name)",
								value: "List all songs in a playlist.\n`&music playlist xi`"
							},
							{
								name: "play [start] [end]",
								value: "Play a playlist.\n\
												Optionally, specify values for start and end to play specific songs from a playlist. \
												Start and end are item index numbers, but you can also use `-` to specify all songs towards the list boundary.\
												\n`&music playlist xi play` (plays the entire playlist named `xi`)\
												\n`&music playlist xi play 32` (plays item #32 from the playlist)\
												\n`&music playlist xi play 3 6` (plays items #3, #4, #5 and #6 from the playlist)\
												\n`&music playlist xi play 20 -` (plays all items from #20 to the end of the playlist)"
							},
							{
								name: "shuffle [start] [end]",
								value: "Play the songs from a playlist, but shuffle them into a random order before queuing them. Works exactly like `play`.\n`&music playlist xi shuffle`"
							},
							{
								name: "add <url>",
								value: "Add a song to a playlist. Specify a URL the same as `&music play`.\
												\n`&music playlist xi add https://youtube.com/watch?v=e53GDo-wnSs`"
							},
							{
								name: "remove <index>",
								value: "Remove a song from a playlist.\
												\n`index` is the index of the item to be removed.\
												\n`&music playlist xi remove 12`"
							},
							{
								name: "move <index1> <index2>",
								value: "Move items around within a playlist. \
												`index1` is the index of the item to be moved, `index2` is the index of the position it should be moved to.\
												\nThe indexes themselves will not be swapped with each other. Instead, all items in between will be shifted up or down to make room. \
												`&music playlist xi move 12 13`"
							},
							{
								name: "find",
								value: "Find specific items in a playlist.\
												\nProvide some text to search for, and matching songs will be shown.\
												\n`&music playlist undertale find hopes and dreams`"
							},
							{
								name: "import <url>",
								value: "Import a playlist from YouTube into Amanda. `url` is a YouTube playlist URL.\
												\n`&music playlist undertale import https://www.youtube.com/playlist?list=PLpJl5XaLHtLX-pDk4kctGxtF4nq6BIyjg`"
							},
							{
								name: "bulk",
								value: "Easily add many songs at once through a menu interface."
							},
							{
								name: "delete",
								value: "Delete a playlist. You'll be asked for confirmation.\n`&music playlist xi delete`"
							}
						])
						.setFooter("<> = Required, [] = Optional, | = Or. Do not include <>, [], or | in your input")
						.setColor(constants.standard_embed_color)
					msg.channel.send(await utils.contentify(msg.channel, embed))
				} else {
					const command = commands.cache.find(c => c.aliases.includes(suffix))
					if (command) {
						let info = { usage: command.usage, description: command.description }
						if (lang[command.category]) {
							const langcommand = lang[command.category][command.aliases[0]]
							if (langcommand) info = { usage: langcommand.help.usage, description: langcommand.help.description }
						}
						embed = new Discord.MessageEmbed()
							.setAuthor(`Help for ${command.aliases[0]}`)
							.setDescription(`Arguments: ${info.usage}\nDescription: ${info.description}\nAliases: ${command.aliases.map(a => `\`${a}\``).join(", ")}\nCategory: ${command.category}\nExample: ${command.example || "N.A."}`)
							.setFooter("<> = Required, [] = Optional, | = Or. Do not include <>, [], or | in your input")
							.setColor(constants.standard_embed_color)
						msg.channel.send(await utils.contentify(msg.channel, embed))
					} else if (commands.categories.get(suffix)) {
						const cat = commands.categories.get(suffix)
						const maxLength = cat.reduce((acc, cur) => Math.max(acc, cur.length), 0)
						embed = new Discord.MessageEmbed()
							.setAuthor(`Command Category: ${suffix}`)
							.setDescription(
								cat.sort((a, b) => {
									const cmda = commands.cache.get(a)
									const cmdb = commands.cache.get(b)
									if (cmda.order !== undefined && cmdb.order !== undefined) { // both are numbers, sort based on that, lowest first
										return cmda.order - cmdb.order
									} else if (cmda.order !== undefined) { // a is defined, sort a first
										return -1
									} else if (cmdb.order !== undefined) { // b is defined, sort b first
										return 1
									} else { // we don't care
										return 0
									}
								}).map(c => {
									const cmd = commands.cache.get(c)
									let desc
									if (lang[suffix] && lang[suffix][c] && !["music", "playlist"].includes(c)) desc = lang[suffix][c].help.description
									else desc = cmd.description
									return `\`${cmd.aliases[0]}${" ​".repeat(maxLength - cmd.aliases[0].length)}\` ${desc}`
								}).join("\n") +
							`\n\n${lang.meta.help.returns.footer}`)
							.setColor(constants.standard_embed_color)
						if ((await utils.cacheManager.channels.hasPermissions({ id: msg.channel.id, guild_id: msg.guild ? msg.guild.id : undefined }, 0x00000040))) embed.setFooter(lang.meta.help.returns.mobile)
						msg.channel.send(await utils.contentify(msg.channel, embed)).then(message => {
							const mobileEmbed = new Discord.MessageEmbed()
								.setAuthor(`Command Category: ${suffix}`)
								.setDescription(cat.map(c => {
									const cmd = commands.cache.get(c)
									let desc
									if (lang[suffix] && lang[suffix][c] && !["music", "playlist"].includes(c)) desc = lang[suffix][c].help.description
									else desc = cmd.description
									return `**${cmd.aliases[0]}**\n${desc}`
								}).join("\n\n"))
								.setColor(constants.standard_embed_color)
							const menu = new ReactionMenu(message, client, [{ emoji: "📱", ignore: "total", actionType: "js", actionData: async () => message.edit(await utils.contentify(message.channel, mobileEmbed)) }])
							setTimeout(() => menu.destroy(true), 5 * 60 * 1000)
						})
					} else {
						embed = new Discord.MessageEmbed().setDescription(utils.replace(lang.meta.help.prompts.invalidCommand, { "tag": msg.author.tag })).setColor("B60000")
						msg.channel.send(await utils.contentify(msg.channel, embed))
					}
				}
			} else {
				embed = new Discord.MessageEmbed()
					.setAuthor("Command Categories")
					.setDescription(
						`❯ ${Array.from(commands.categories.keys()).filter(c => c != "admin").join("\n❯ ")}\n\n${lang.meta.help.returns.main}\n\n${utils.replace(lang.meta.help.returns.info, { "link": constants.invite_link_for_help })}`)
					.setColor(constants.standard_embed_color)
				msg.channel.send(await utils.contentify(msg.channel, embed))
			}
		}
	}
]

commands.assign(cmds)
