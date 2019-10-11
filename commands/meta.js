//@ts-check

const rp = require("request-promise")
const bs = require("buffer-signature")
const fs = require("fs")
const Discord = require("discord.js")
/** @type {import("jimp").default} */
//@ts-ignore
const Jimp = require("jimp")
const path = require("path")
const simpleGit = require("simple-git")(__dirname)
const profiler = require("gc-profiler")
const util = require("util")

const emojis = require("../modules/emojis")

const passthrough = require("../passthrough")
let {client, config, commands, reloadEvent, reloader, gameStore, queueStore, periodicHistory} = passthrough

let utils = require("../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

let sendStatsTimeout = setTimeout(sendStatsTimeoutFunction, 1000*60*60 - (Date.now() % (1000*60*60)))
console.log(`added timeout sendStatsTimeout`)
function sendStatsTimeoutFunction() {
	sendStats()
	sendStatsTimeout = setTimeout(sendStatsTimeoutFunction, 1000*60*60)
}
/**
 * @param {Discord.Message} [msg]
 */
async function sendStats(msg) {
	console.log("Sending stats...")
	let now = Date.now()
	let myid = client.user.id
	let ramUsageKB = Math.floor(((process.memoryUsage().rss - (process.memoryUsage().heapTotal - process.memoryUsage().heapUsed)) / 1024))
	let users = client.users.size
	let guilds = client.guilds.size
	let channels = client.channels.size
	let voiceConnections = client.lavalink.players.size
	let shard = utils.getFirstShard()
	let uptime = process.uptime()
	await utils.sql.all(
		"INSERT INTO StatLogs (time, id, ramUsageKB, users, guilds, channels, voiceConnections, uptime, shard)"
		+" VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
		,[now, myid, ramUsageKB, users, guilds, channels, voiceConnections, uptime, shard])
	if (msg) msg.react("👌")
	return console.log("Sent stats.", new Date().toUTCString())
}

reloadEvent.once(path.basename(__filename), () => {
	clearTimeout(sendStatsTimeout)
	console.log(`removed Timeout sendStatsTimeout`)
})

let profileStorage = new utils.JIMPStorage()
profileStorage.save("canvas", "file", "./images/defaultbg.png")
profileStorage.save("profile", "file", "./images/profile.png")
profileStorage.save("font", "font", ".fonts/Whitney-25.fnt")
profileStorage.save("font2", "font", ".fonts/profile/Whitney-20-aaa.fnt")
profileStorage.save("heart-full", "file", "./images/emojis/pixel-heart.png")
profileStorage.save("heart-broken", "file", "./images/emojis/pixel-heart-broken.png")
profileStorage.save("badge-developer", "file", "./images/badges/Developer_50x50.png")
profileStorage.save("badge-donator", "file", "./images/badges/Donator_50x50.png")
profileStorage.save("badge-none", "file", "./images/36393E.png")
profileStorage.save("badge-hunter", "file", "./images/badges/Hunter_50x50.png")
profileStorage.save("badge-booster", "file", "./images/badges/Booster_50x50.png")
profileStorage.get("badge-none").then(badge => badge.resize(50, 50))
profileStorage.get("badge-hunter").then(badge => badge.resize(34, 34))

/**
 * @param {Discord.User} user
 * @param {{waifu?: {id: string}, claimer?: {id: string}}} info
 */
function getHeartType(user, info) {
	// Full hearts for Amanda! Amanda loves everyone.
	if (user.id == client.user.id) return "full"
	// User doesn't love anyone. Sad.
	if (!info.waifu) return "broken"
	// Full heart if user loves Amanda.
	if (info.waifu.id == client.user.id) return "full"
	// User isn't loved by anyone. Oh dear...
	if (!info.claimer) return "broken"
	// If we get here, then the user both loves and is loved back, but not by Amanda.
	// User is loved back by the same person
	if (info.waifu.id == info.claimer.id) return "full"
	// So the user must be loved by someone else.
	return "broken"
}

commands.assign({
	"statistics": {
		usage: "[music|games]",
		description: "Displays detailed statistics",
		aliases: ["statistics", "stats"],
		category: "meta",
		process: async function(msg, suffix) {
			let ram = process.memoryUsage()
			let embed = new Discord.MessageEmbed().setColor(0x36393f)
			if (!suffix) return defaultStats()
			if (suffix.toLowerCase() == "music") {
				let songsPlayed = periodicHistory.getSize("song_start")
				embed
				.addField(`${client.user.tag} <:online:606664341298872324>`,
				`**❯ Songs Played Today:**\n${songsPlayed} songs\n`+
				`**❯ Songs Queued:**\n${[...queueStore.store.values()].reduce((acc, cur) => acc+cur.songs.length, 0)} songs`, true)
				.addField(emojis.bl,
				`**❯ Voice Connections:**\n${client.lavalink.players.size} connections\n`+
				`**❯ Users Listening:**\n${[...queueStore.store.values()].reduce((acc, cur) => acc+cur.voiceChannel.members.filter(m => m.user && !m.user.bot).size, 0)} users`, true)
				return msg.channel.send(utils.contentify(msg.channel, embed))
			} else if (suffix.toLowerCase() == "games") {
				let gamesPlayed = periodicHistory.getSize("game_start")
				embed
				.addField(`${client.user.tag} <:online:606664341298872324>`,
					`**❯ Games Played Today:**\n${gamesPlayed} games\n`+
					`**❯ Games In Progress:**\n${gameStore.store.size} games`, true)
				.addField(emojis.bl,
					`**❯ Users Playing:**\n${gameStore.store.reduce((acc, cur) => acc+cur.receivedAnswers?cur.receivedAnswers.size:0, 0)} users`, true)
				return msg.channel.send(utils.contentify(msg.channel, embed))
			} else if (suffix.toLowerCase() == "gc") {
				let allowed = await utils.hasPermission(msg.author, "eval")
				if (!allowed) return
				if (global.gc) global.gc()
				else return msg.channel.send("The global Garbage Collector variable is not exposed")
				profiler.once("gc", info => {
					let now = process.memoryUsage()
					return msg.channel.send(`Garbage Collection completed in ${info.duration}ms.\nrss: ${bToMB(ram.rss)} → ${bToMB(now.rss)}\nheapTotal: ${bToMB(ram.heapTotal)} → ${bToMB(now.heapTotal)}\nheapUsed: ${bToMB(ram.heapUsed)} → ${bToMB(now.heapUsed)}\nexternal: ${bToMB(ram.external)} → ${bToMB(now.external)}\nComputed: ${bToMB(ram.rss - (ram.heapTotal - ram.heapUsed))} → ${bToMB(now.rss - (now.heapTotal - now.heapUsed))}`)
				})
			} else return defaultStats()
			async function defaultStats() {
				let nmsg = await msg.channel.send("Ugh. I hate it when I'm slow, too")
				embed
				.addField(`${client.user.tag} <:online:606664341298872324>`,
					`**❯ Heartbeat:**\n${client.ws.ping.toFixed(0)}ms\n`+
					`**❯ Latency:**\n${nmsg.createdTimestamp - msg.createdTimestamp}ms\n`+
					`**❯ Uptime:**\n${utils.shortTime(process.uptime(), "sec")}\n`+
					`**❯ RAM Usage:**\n${bToMB(ram.rss - (ram.heapTotal - ram.heapUsed))}`, true)
				.addField(emojis.bl,
					`**❯ User Count:**\n${client.users.size} users\n`+
					`**❯ Guild Count:**\n${client.guilds.size} guilds\n`+
					`**❯ Channel Count:**\n${client.channels.size} channels\n`+
					`**❯ Voice Connections:**\n${client.lavalink.players.size} connections`, true)
				let content = utils.contentify(msg.channel, embed)
				if (typeof(content) == "string") nmsg.edit(content)
				else if (content instanceof Discord.MessageEmbed) nmsg.edit("", content)
			}
			function bToMB (number) {
				return `${((number/1024)/1024).toFixed(2)}MB`
			}
		}
	},
	"ping": {
		usage: "None",
		description: "Gets latency to Discord",
		aliases: ["ping", "pong"],
		category: "meta",
		process: async function (msg) {
			let array = ["So young... So damaged...", "We've all got no where to go...", "You think you have time...", "Only answers to those who have known true despair...", "Hopeless...", "Only I know what will come tomorrow...", "So dark... So deep... The secrets that you keep...", "Truth is false...", "Despair..."]
			let message = utils.arrayRandom(array)
			let nmsg = await msg.channel.send(message)
			let embed = new Discord.MessageEmbed().setAuthor("Pong!").addField("❯ Heartbeat:", `${client.ws.ping.toFixed(0)}ms`, true).addField(`❯ Latency:`, `${nmsg.createdTimestamp - msg.createdTimestamp}ms`, true).setFooter("W-Wait... It's called table tennis").setColor("36393E")
			let content = utils.contentify(msg.channel, embed)
			if (typeof(content) == "string") nmsg.edit(content)
			else if (content instanceof Discord.MessageEmbed) nmsg.edit("", content)
		}
	},
	"forcestatupdate": {
		usage: "None",
		description: "",
		aliases: ["forcestatupdate"],
		category: "admin",
		process: async function(msg) {
			let permissions = await utils.hasPermission(msg.author, "eval");
			if (!permissions) return;
			sendStats(msg)
		}
	},
	"restartnotify": {
		usage: "None",
		description: "",
		aliases: ["restartnotify"],
		category: "admin",
		process: async function(msg) {
			let permissions
			if (msg.channel instanceof Discord.TextChannel) permissions = msg.channel.permissionsFor(client.user)
			await utils.sql.all("REPLACE INTO RestartNotify VALUES (?, ?, ?)", [client.user.id, msg.author.id, msg.channel.id])
			if (permissions && !permissions.has("ADD_REACTIONS")) return msg.channel.send(`Alright. You'll be notified of the next time I restart`)
			msg.react("✅")
		}
	},
	"invite": {
		usage: "None",
		description: "Add Amanda to a server",
		aliases: ["invite", "inv"],
		category: "meta",
		process: async function(msg, suffix, lang) {
			let embed = new Discord.MessageEmbed()
			.setTitle(lang.meta.invite.returns.invited)
			.setDescription(
				lang.meta.invite.returns.notice
				+"\nInvite link: https://discord-bots.ga/amanda"
			)
			.setColor(0x36393f)
			msg.channel.send(utils.contentify(msg.channel, embed))
		}
	},
	"info": {
		usage: "None",
		description: "Displays information about Amanda",
		aliases: ["info", "inf"],
		category: "meta",
		process: async function(msg, suffix, lang) {
			let [c1, c2] = await Promise.all([
				client.users.fetch("320067006521147393", true),
				client.users.fetch("176580265294954507", true)
			])
			let embed = new Discord.MessageEmbed()
				.setAuthor("Amanda", client.user.avatarURL({format: "png", size: 32}))
				.setDescription(lang.meta.info.returns.thanks)
				.addField(lang.meta.info.returns.creators,
					`${c1.tag} <:bravery:479939311593324557> <:EarlySupporterBadge:585638218255564800> <:NitroBadge:421774688507920406> <:boostlvl4:582555056369434635>\n`+
					`${c2.tag} <:brilliance:479939329104412672> <:EarlySupporterBadge:585638218255564800> <:NitroBadge:421774688507920406> <:boostlvl4:582555056369434635>`)
				.addField("Code", `[node.js](https://nodejs.org/) ${process.version} + [discord.js](https://www.npmjs.com/package/discord.js) ${Discord.version}`)
				.addField("Links", utils.replace(lang.meta.info.returns.links, {"website": `${config.website_protocol}://${config.website_domain}/`}))
				.setColor("36393E")
			return msg.channel.send(utils.contentify(msg.channel, embed))
		}
	},
	"donate": {
		usage: "None",
		description: "Get information on how to donate",
		aliases: ["donate", "patreon"],
		category: "meta",
		process: function(msg, suffix, lang) {
			let embed = new Discord.MessageEmbed()
			.setColor(0x36393f)
			.setTitle(lang.meta.donate.returns.intro)
			.setDescription(lang.meta.donate.returns.description)
			return msg.channel.send(utils.contentify(msg.channel, embed))
		}
	},
	"commits": {
		usage: "None",
		description: "Gets the latest git commits to Amanda",
		aliases: ["commits", "commit", "git"],
		category: "meta",
		process: async function(msg) {
			msg.channel.sendTyping()
			const limit = 5
			const authorNameMap = {
				"Cadence Fish": "Cadence",
				"Papi": "PapiOphidian"
			}
			let res = await new Promise((r) => {
				simpleGit.status((err, status) => {
					simpleGit.log({"--no-decorate": null}, (err, log) => {
						Promise.all(Array(limit).fill(undefined).map((_, i) => new Promise(resolve => {
							simpleGit.diffSummary([log.all[i+1].hash, log.all[i].hash], (err, diff) => {
								resolve(diff)
							})
						}))).then(diffs => {
							let result = {branch: status.current, latestCommitHash: log.latest.hash.slice(0, 7), logString:
							log.all.slice(0, limit).map((line, index) => {
								let date = new Date(line.date)
								let dateString = date.toDateString()+" @ "+date.toTimeString().split(":").slice(0, 2).join(":")
								let diff =
									diffs[index].files.length+" files changed, "+
									diffs[index].insertions+" insertions, "+
									diffs[index].deletions+" deletions."
									return ""+
												"`» "+line.hash.slice(0, 7)+": "+dateString+" — "+(authorNameMap[line.author_name] || "Unknown")+"`\n"+
												"`» "+diff+"`\n"+
												line.message
							}).join("\n\n")}
							r(result)
						})
					})
				})
			})
			let embed = new Discord.MessageEmbed()
				.setTitle("Git info")
				.addField("Status", "On branch "+res.branch+", latest commit "+res.latestCommitHash)
				.addField(`Commits (latest ${limit} entries)`, res.logString)
				.setColor("36393E")
			return msg.channel.send(utils.contentify(msg.channel, embed))
		}
	},
	"privacy": {
		usage: "None",
		description: "Details Amanda's privacy statement",
		aliases: ["privacy"],
		category: "meta",
		process: async function(msg) {
			let embed = new Discord.MessageEmbed().setAuthor("Privacy").setDescription("Amanda may collect basic user information. This data includes but is not limited to usernames, discriminators, profile pictures and user identifiers also known as snowflakes. This information is exchanged solely between services related to the improvement or running of Amanda and [Discord](https://discordapp.com/terms). It is not exchanged with any other providers. That's a promise. If you do not want your information to be used by the bot, remove it from your servers and do not use it").setColor("36393E")
			try {
				await msg.author.send(embed)
				if (msg.channel.type != "dm") msg.channel.send("I sent you a DM")
				return
			} catch (reason) { return msg.channel.send(utils.contentify(msg.channel, embed)) }
		}
	},
	"user": {
		usage: "[user]",
		description: "Provides information about a user",
		aliases: ["user"],
		category: "meta",
		process: async function(msg, suffix, lang) {
			let user, member
			if (msg.channel.type == "text") {
				member = await msg.guild.findMember(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.findUser(msg, suffix, true)
			if (!user) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidUser, {"username": msg.author.username}))
			let embed = new Discord.MessageEmbed().setColor("36393E")
			embed.addField("User ID:", user.id)
			let userCreatedTime = user.createdAt.toUTCString()
			embed.addField("Account created at:", userCreatedTime)
			if (member) {
				let guildJoinedTime = member.joinedAt.toUTCString()
				embed.addField(`Joined ${msg.guild.name} at:`, guildJoinedTime)
			}
			let status = user.activityEmoji
			let activity = `*${user.activeOn}*\n`
			if (user.presence.activity && user.presence.activity.type == "STREAMING") {
				activity += `Streaming [${user.presence.activity.name}](${user.presence.activity.url})`
				if (user.presence.activity.details) activity += `<:RichPresence:477313641146744842>\nPlaying ${user.presence.activity.details}`
				status =`<:streaming:606815351967318019>`
			} else if (user.presence.activity) {
				activity += user.activityPrefix+" **"+user.presence.activity.name+"**"
				if (user.presence.activity.details) activity += `<:RichPresence:477313641146744842>\n${user.presence.activity.details}`
				if (user.presence.activity.state && user.presence.activity.name == "Spotify") activity += `\nby ${user.presence.activity.state}`
				else if (user.presence.activity.state) activity += `\n${user.presence.activity.state}`
			}
			if (user.bot) status = "<:bot:412413027565174787>"
			embed.setThumbnail(!user.displayAvatarURL().endsWith("gif")?user.displayAvatarURL({format: "png"}):user.displayAvatarURL())
			embed.addField("Avatar URL:", `[Click Here](${!user.displayAvatarURL().endsWith("gif")?user.displayAvatarURL({format: "png"}):user.displayAvatarURL()})`)
			embed.setTitle(`${user.tag}${status}`)
			if (activity) embed.setDescription(activity)
			return msg.channel.send(utils.contentify(msg.channel, embed))
		}
	},
	"avatar": {
		usage: "[user]",
		description: "Gets a user's avatar",
		aliases: ["avatar", "pfp"],
		category: "meta",
		process: async function(msg, suffix, lang) {
			let canEmbedLinks = true
			if (msg.channel instanceof Discord.TextChannel) {
				if (!msg.channel.permissionsFor(client.user).has("EMBED_LINKS")) {
					canEmbedLinks = false
				}
			}
			/** @type {Discord.User} */
			let user = null
			if (msg.channel.type == "text") {
				let member = await msg.guild.findMember(msg, suffix, true)
				if (member) {
					user = member.user
				}
			} else {
				user = await utils.findUser(msg, suffix, true)
			}
			if (!user) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidUser, {"username": msg.author.username}))
			let isAnimated = user.displayAvatarURL().endsWith("gif")
			let url = user.displayAvatarURL({format: isAnimated ? "gif" : "png", size: 2048})
			if (canEmbedLinks) {
				let embed = new Discord.MessageEmbed()
				.setImage(url)
				.setColor(0x36393f)
				msg.channel.send(embed)
			} else {
				msg.channel.send(url)
			}
		}
	},
	"wumbo": {
		usage: "<emoji>",
		description: "Makes an emoji bigger",
		aliases: ["wumbo"],
		category: "meta",
		process: function(msg, suffix) {
			let permissions
			if (msg.channel instanceof Discord.TextChannel) permissions = msg.channel.permissionsFor(client.user)
			if (!suffix) return msg.channel.send(`That's not a valid emoji`)
			let emoji = Discord.Util.parseEmoji(suffix)
			if (emoji == null) return msg.channel.send(`That's not a valid emoji`)
			let url = utils.emojiURL(emoji.id, emoji.animated)
			let embed = new Discord.MessageEmbed()
				.setImage(url)
				.setColor("36393E")
			if (permissions && !permissions.has("EMBED_LINKS")) return msg.channel.send(url)
			return msg.channel.send({embed})
		}
	},
	"profile": {
		usage: "[user]",
		description: "Get profile information about someone",
		aliases: ["profile"],
		category: "meta",
		process: async function(msg, suffix, lang) {
			let user, member, permissions
			if (msg.channel instanceof Discord.TextChannel) permissions = msg.channel.permissionsFor(client.user)
			if (permissions && !permissions.has("ATTACH_FILES")) return msg.channel.send(lang.gambling.wheel.prompts.permissionDenied)
			if (msg.channel.type == "text") {
				member = await msg.guild.findMember(msg, suffix, true)
				if (member) user = member.user
			} else user = await utils.findUser(msg, suffix, true)
			if (!user) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidUser, {"username": msg.author.username}))
			msg.channel.sendTyping()

			let [isOwner, isPremium, money, info, avatar, images] = await Promise.all([
				utils.hasPermission(user, "owner"),
				utils.sql.get("SELECT * FROM Premium WHERE userID =?", user.id),
				utils.coinsManager.get(user.id),
				utils.waifu.get(user.id),
				Jimp.read(user.avatarURL({format: "png", size: 128})),
				profileStorage.getAll(["canvas", "profile", "font", "font2", "heart-full", "heart-broken", "badge-developer", "badge-donator", "badge-none", "badge-hunter", "badge-booster"])
			])

			avatar.resize(111, 111)

			let heartType = getHeartType(user, info)
			let heart = images.get("heart-"+heartType)

			let badge = isOwner ? "badge-developer" : isPremium ? "badge-donator" : "badge-none"
			let mem = client.guilds.get("475599038536744960").members.get(user.id)
			let boosting, hunter
			if (mem) {
				boosting = mem.roles.has("613685290938138625")
				hunter = mem.roles.has("497586624390234112")
			}
			let badgeImage = images.get(badge)
			/** @type {import("jimp").default} */
			let canvas

			if (isOwner||isPremium) {
				try {
					canvas = await Jimp.read(`./images/backgrounds/${user.id}.png`)
				} catch (e) {
					canvas = images.get("canvas").clone()
				}
			} else canvas = images.get("canvas").clone()
			canvas.composite(avatar, 32, 85)
			canvas.composite(images.get("profile"), 0, 0)
			canvas.composite(badgeImage, 166, 113)
			if (boosting) {
				if (badge == "badge-none") canvas.composite(images.get("badge-booster"), 166, 115)
				else canvas.composite(images.get("badge-booster"), 216, 115)
			}

			let font = images.get("font")
			let font2 = images.get("font2")
			canvas.print(font, 508, 72, user.username)
			canvas.print(font2, 508, 104, `#${user.discriminator}`)
			canvas.print(font2, 550, 163, money)
			canvas.composite(heart, 508, 207)
			canvas.print(font2, 550, 213, user.id == client.user.id ? "You <3" : info.waifu?info.waifu.tag:"Nobody, yet")
			if (hunter) {
				canvas.composite(images.get("badge-hunter"), 508, 250)
				canvas.print(font2, 550, 260, "Amanda Bug Catcher")
			}

			let buffer = await canvas.getBufferAsync(Jimp.MIME_PNG)
			let image = new Discord.MessageAttachment(buffer, "profile.png")
			return msg.channel.send({files: [image]})
		}
	},
	"settings": {
		usage: "<self|server> <view|setting name> [value]",
		description: "Modify settings Amanda will use for yourself or server wide",
		aliases: ["settings"],
		category: "configuration",
		process: async function(msg, suffix) {
			let args = suffix.split(" "), permissions
			if (msg.channel instanceof Discord.TextChannel) permissions = msg.channel.permissionsFor(client.user)
			if (msg.channel.type == "dm") {
				if (args[0].toLowerCase() == "server") return msg.channel.send(`You cannot modify a server's settings if you don't use the command in a server`)
			}

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
					default: "[unset] (Recommended to be a 800x500px png/jpeg)",
					scope: "self"
				},
				"language": {
					type: "string",
					default: "en-us",
					scope: ["self", "server"]
				}
			}

			const tableNames = {self: "SettingsSelf", server: "SettingsGuild"}

			let scope = args[0].toLowerCase()
			if (!["self", "server"].includes(scope)) return msg.channel.send(
				"Command syntax is `&settings <scope> <name> <value>`. "
				+"Your value for `scope` was incorrect, it must be either `self` or `server`."
			)
			let tableName = tableNames[scope]
			let keyID = scope == "self" ? msg.author.id : msg.guild.id

			let settingName = args[1] ? args[1].toLowerCase() : ""
			if (args[1] == "view") {
				let all = await utils.sql.all("SELECT * FROM "+tableName+" WHERE keyID =?", keyID)
				if (all.length == 0) return msg.channel.send(`There are no settings set for scope ${scope}`)
				return msg.channel.send(all.map(a => `${a.setting}: ${a.value}`).join("\n"))
			}

			if (scope == "server" && !msg.member.hasPermission("MANAGE_GUILD")) return msg.channel.send(
				`You must have either the Manage Server or Administrator permission to modify Amanda's settings on this server.`
			)

			let setting = settings[settingName]
			if (!setting) return msg.channel.send(
				`Command syntax is \`&settings ${this.usage}\`. `
				+"Your value for `name` was incorrect, it must be one of: "
				+Object.keys(settings).filter(k => settings[k].scope.includes(scope)).map(k => "`"+k+"`").join(", ")
			)
			if (!setting.scope.includes(scope)) return msg.channel.send("The setting `"+settingName+"` is not valid for the scope `"+scope+"`.")

			let value = args[2]
			if (value == undefined) {
				let row = await utils.sql.get("SELECT value FROM "+tableName+" WHERE keyID = ? AND setting = ?", [keyID, settingName])
				if (scope == "server") {
					value = row ? row.value : setting.default
					if (setting.type == "boolean") {
						value = (!!+value)+""
					}
					if (row) {
						return msg.channel.send("Current value of `"+settingName+"` is `"+value+"`. This value was set for the server.")
					} else {
						return msg.channel.send("Current value of `"+settingName+"` is not set in this server, so it inherits the default value, which is `"+value+"`.")
					}
				} else if (scope == "self") {
					let serverRow;
					if (msg.channel.type == "text") serverRow = await utils.sql.get("SELECT value FROM SettingsGuild WHERE keyID = ? AND setting = ?", [msg.guild.id, settingName])
					let values = [
						setting.default,
						serverRow ? serverRow.value : null,
						row ? row.value : null
					]
					if (setting.type == "boolean") {
						values = values.map(v => v != null ? !!+v : v)
					}
					let finalValue = values.reduce((acc, cur) => (cur != null ? cur : acc), "[no default]")
					return msg.channel.send(
						"Default value: "+values[0]+"\n"
						+"Server value: "+(values[1] != null ? values[1] : "[unset]")+"\n"
						+"Your value: "+(values[2] != null ? values[2] : "[unset]")+"\n"
						+"Computed value: "+finalValue
					)
				}
			}
			value = value.toLowerCase()

			if (value === "null") {
				if (settingName == "profilebackground") {
					try {
						await fs.promises.unlink(`./images/backgrounds/${msg.author.id}.png`)
					} catch (e) {
						return msg.channel.send("You didn't have a profile background image. No action was taken.")
					}
				}
				await utils.sql.all("DELETE FROM "+tableName+" WHERE keyID = ? AND setting = ?", [keyID, settingName])
				return msg.channel.send("Setting deleted.")
			}

			if (settingName == "profilebackground") {
				await msg.channel.sendTyping()
				let [isEval, isPremium] = await Promise.all([
					utils.hasPermission(msg.author, "owner"),
					utils.sql.get("SELECT * FROM Premium WHERE userID =?", msg.author.id)
				])
				let allowed = false
				if (isEval) allowed = true
				if (isPremium) allowed = true
				if (!allowed) return msg.channel.send("You must be a donor to modify this setting.")
				let data
				try {
					data = await rp(value, { encoding: null })
				} catch (e) {
					return msg.channel.send("There was an error trying to fetch the data from the link provided. Please make sure the link is valid.")
				}
				let type = bs.identify(data)
				if (!["image/png", "image/jpeg"].includes(type.mimeType)) return msg.channel.send("You may not set a background which is not a PNG or a JPEG")
				let image = await Jimp.read(value)
				image.cover(800, 500)
				let buffer = await image.getBufferAsync(Jimp.MIME_PNG)
				await fs.promises.writeFile(`./images/backgrounds/${msg.author.id}.png`, buffer)
				await utils.sql.all("REPLACE INTO "+tableName+" (keyID, setting, value) VALUES (?, ?, ?)", [keyID, settingName, 1])
				return msg.channel.send("Setting updated.")
			}

			if (settingName == "language") {
				if (!["en-us", "en-owo"].includes(value)) return msg.channel.send(`${msg.author.username}, that is not a valid or supported language code`)
				await utils.sql.all("REPLACE INTO "+tableName+" (keyID, setting, value) VALUES (?, ?, ?)", [keyID, settingName, value])
				return msg.channel.send("Setting updated.")
			}

			if (setting.type == "boolean") {
				let value = args[2].toLowerCase()
				if (!["true", "false"].includes(value)) return msg.channel.send(
					"Command syntax is `&settings <scope> <name> <value>`. "
					+"The setting `"+settingName+"` is a boolean, and so your `"+value+"` must be either `true` or `false`."
				)
				let value_result = args[2] == "true" ? "1" : "0"
				await utils.sql.all("REPLACE INTO "+tableName+" (keyID, setting, value) VALUES (?, ?, ?)", [keyID, settingName, value_result])
				return msg.channel.send("Setting updated.")

			} else if (setting.type == "string") {
				let value = args[2].toLowerCase()
				if (value.length > 50) return msg.channel.send("That setting value is too long. It must not be more than 50 characters.")
				await utils.sql.all("REPLACE INTO "+tableName+" (keyID, setting, value) VALUES (?, ?, ?)", [keyID, settingName, value])
				return msg.channel.send("Setting updated.")

			} else {
				throw new Error("Invalid reference data type for setting `"+settingName+"`")
			}
		}
	},
	"help": {
		usage: "[command]",
		description: "Your average help command",
		aliases: ["help", "h", "commands", "cmds"],
		category: "meta",
		process: async function (msg, suffix) {
			let embed, permissions
			if (msg.channel instanceof Discord.TextChannel) permissions = msg.channel.permissionsFor(client.user)
			if (suffix) {
				suffix = suffix.toLowerCase()
				if (suffix == "music" || suffix == "m") {
					embed = new Discord.MessageEmbed()
					.setAuthor("&music: command help (aliases: music, m)")
					.addField(`play`, `Play a song or add it to the end of the queue. Use any YouTube video or playlist url or video name as an argument.\n\`&music play https://youtube.com/watch?v=e53GDo-wnSs\` or\n\`&music play despacito\``)
					.addField(`insert`, `Works the same as play, but inserts the song at the start of the queue instead of at the end.\n\`&music insert https://youtube.com/watch?v=e53GDo-wnSs\``)
					.addField(`now`, `Show the current song.\n\`&music now\``)
					.addField(`pause`, `Pause playback.\n\`&music pause\``)
					.addField(`resume`, `Resume playback. (Unpause.)\n\`&music resume\``)
					.addField(`info`, `Shows information about the current song/Frisky station\n\`&music info\``)
					.addField(`related [play|insert] [index]`,
						"Show videos related to what's currently playing. Specify either `play` or `insert` and an index number to queue that song.\n"+
						"`&music related` (shows related songs)\n"+
						"`&music rel play 8` (adds related song #8 to the end of the queue)")
					.addField("auto", "Enable or disable auto mode.\n"+
						"When auto mode is enabled, when the end of the queue is reached, the top recommended song will be queued automatically, and so music will play endlessly.\n"+
						"`&music auto`")
					.addField(`queue [remove|clear] [index]`,
						`Display or edit the current queue.\n`+
						"`&music queue`\n"+
						"`&music queue remove 2`")
					.addField(`skip`, `Skip the current song and move to the next item in the queue.\n\`&music skip\``)
					.addField(`stop`, `Empty the queue and leave the voice channel.\n\`&music stop\``)
					.addField(`playlist`, `Manage playlists. Try \`&help playlist\` for more info.`)
					.setColor('36393E')
					send("dm").catch(() => send("channel"))
				} else if (suffix.includes("playlist")) {
					embed = new Discord.MessageEmbed()
					.setAuthor(`&music playlist: command help (aliases: playlist, playlists, pl)`)
					.setDescription("All playlist commands begin with `&music playlist` followed by the name of a playlist. "+
						"If the playlist name does not exist, you will be asked if you would like to create a new playlist with that name.\n"+
						"Note that using `add`, `remove`, `move`, `import` and `delete` require you to be the owner (creator) of a playlist.")
					.addField("show", "Show a list of all playlists.\n`&music playlist show`")
					.addField("(just a playlist name)", "List all songs in a playlist.\n`&music playlist xi`")
					.addField("play [start] [end]", "Play a playlist.\n"+
						"Optionally, specify values for start and end to play specific songs from a playlist. "+
						"Start and end are item index numbers, but you can also use `-` to specify all songs towards the list boundary.\n"+
						"`&music playlist xi play` (plays the entire playlist named `xi`)\n"+
						"`&music playlist xi play 32` (plays item #32 from the playlist)\n"+
						"`&music playlist xi play 3 6` (plays items #3, #4, #5 and #6 from the playlist)\n"+
						"`&music playlist xi play 20 -` (plays all items from #20 to the end of the playlist)")
					.addField("shuffle [start] [end]", "Play the songs from a playlist, but shuffle them into a random order before queuing them. Works exactly like `play`.\n`&music playlist xi shuffle`")
					.addField("add <url>", "Add a song to a playlist. Specify a URL the same as `&music play`.\n"+
						"`&music playlist xi add https://youtube.com/watch?v=e53GDo-wnSs`")
					.addField("remove <index>", "Remove a song from a playlist.\n"+
						"`index` is the index of the item to be removed.\n"+
						"`&music playlist xi remove 12`")
					.addField("move <index1> <index2>", "Move items around within a playlist. "+
						"`index1` is the index of the item to be moved, `index2` is the index of the position it should be moved to.\n"+
						"The indexes themselves will not be swapped with each other. Instead, all items in between will be shifted up or down to make room. "+
						"If you don't understand what this means, try it out yourself.\n"+
						"`&music playlist xi move 12 13`")
					.addField("find", "Find specific items in a playlist.\n"+
						"Provide some text to search for, and matching songs will be shown.\n"+
						"`&music playlist undertale find hopes and dreams`")
					.addField("import <url>", "Import a playlist from YouTube into Amanda. `url` is a YouTube playlist URL.\n"+
						"`&music playlist undertale import https://www.youtube.com/playlist?list=PLpJl5XaLHtLX-pDk4kctGxtF4nq6BIyjg`")
					.addField("delete", "Delete a playlist. You'll be asked for confirmation.\n`&music playlist xi delete`")
					.setColor('36393E')
					send("dm").catch(() => send("channel"))
				} else {
					let command = commands.find(c => c.aliases.includes(suffix))
					if (command) {
						embed = new Discord.MessageEmbed()
						.setAuthor(`Help for ${command.aliases[0]}`)
						.setDescription(`Arguments: ${command.usage}\nDescription: ${command.description}\nAliases: ${command.aliases.map(a => "`"+a+"`").join(", ")}\nCategory: ${command.category}`)
						.setColor("36393E")
						send("channel")
					} else {
						if (commands.categories.get(suffix)) {
							let cat = commands.categories.get(suffix)
							let maxLength = cat.reduce((acc, cur) => Math.max(acc, cur.length), 0)
							embed = new Discord.MessageEmbed()
							.setAuthor(`Command Category: ${suffix}`)
							.setDescription(
								cat.map(c =>`\`${commands.get(c).aliases[0]}${" ​".repeat(maxLength-commands.get(c).aliases[0].length)}\` ${commands.get(c).description}`).join("\n")+
								"\n\nType `&help <command>` to see more information about a command.")
							.setColor("36393E")
							if (permissions && permissions.has("ADD_REACTIONS")) embed.setFooter("Click the reaction for a mobile-compatible view.")
							send("dm").then(mobile).catch(() => send("channel").then(mobile))
							/**
							 * @param {Discord.Message} message
							 */
							function mobile(message) {
								let mobileEmbed = new Discord.MessageEmbed()
								.setAuthor(`Command Category: ${suffix}`)
								.setDescription(cat.map(c => `**${commands.get(c).aliases[0]}**\n${commands.get(c).description}`).join("\n\n"))
								.setColor("36393E")
								let content
								if (msg.channel.type != "dm") {
									if (message.channel instanceof Discord.TextChannel) permissions = message.channel.permissionsFor(client.user)
								}
								if (!permissions || permissions.has("EMBED_LINKS")) content = mobileEmbed
								else {
									function addPart(value) {
										if (value) {
											if (content) content += "\n"
											content += value
										}
									}
									addPart(mobileEmbed.author && `**${mobileEmbed.author.name}**`)
									addPart(mobileEmbed.description)
									addPart(mobileEmbed.fields && mobileEmbed.fields.map(f => f.name+"\n"+f.value).join("\n"))
									addPart(mobileEmbed.footer && mobileEmbed.footer.text)
								}
								//@ts-ignore
								let menu = utils.reactionMenu(message, [{emoji: "📱", ignore: "total", actionType: "edit", actionData: content}])
								setTimeout(() => menu.destroy(true), 5*60*1000)
							}
						} else {
							embed = new Discord.MessageEmbed().setDescription(`**${msg.author.tag}**, I couldn't find the help panel for that command`).setColor("B60000")
							send("channel")
						}
					}
				}
			} else {
				embed = new Discord.MessageEmbed()
				.setAuthor("Command Categories")
				.setDescription(
					`❯ ${Array.from(commands.categories.keys()).filter(c => c != "admin").join("\n❯ ")}\n\n`+
					"Type `&help <category>` to see all commands in that category.\n"+
					"Type `&help <command>` to see more information about a command.")
				.setColor('36393E')
				send("dm").catch(() => send("channel").catch(console.error))
			}
			function send(where) {
				return new Promise((resolve, reject) => {
					let target = where == "dm" ? msg.author : msg.channel
					if (msg.channel instanceof Discord.TextChannel) permissions = msg.channel.permissionsFor(client.user)
					if (!permissions || permissions.has("EMBED_LINKS")) {
						var promise = target.send(embed)
					} else {
						let content = ""
						function addPart(value) {
							if (value) {
								if (content) content += "\n"
								content += value
							}
						}
						addPart(embed.author && `**${embed.author.name}**`)
						addPart(embed.description)
						addPart(embed.fields && embed.fields.map(f => f.name+"\n"+f.value).join("\n"))
						addPart(embed.footer && embed.footer.text)
						if (content.length >= 2000) var promise = target.send(`Please allow me to embed content`)
						else var promise = target.send(content)
					}
					promise.then(dm => {
						if (where == "dm" && msg.channel.type != "dm") msg.channel.send("I sent you a DM")
						resolve(dm)
					}).catch(reject)
				})
			}
		}
	}
})
