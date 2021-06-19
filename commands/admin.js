// @ts-check

const Discord = require("thunderstorm")
const centra = require("centra")
const fetch = centra // aliasing
const util = require("util")
const path = require("path")
const InteractionMenu = require("@amanda/interactionmenu")

const passthrough = require("../passthrough")
const { config, constants, client, commands, db, sync, games, queues, streaks, frisky, weeb } = passthrough

/**
 * @type {import("../modules/utilities")}
 */
const utils = sync.require("../modules/utilities")

/**
 * @type {import("./music/common")}
 */
const common = sync.require("./music/common.js")

const replaceBlackList = [
	client.token,
	config.sql_password,
	config.yt_api_key,
	config.chewey_api_key,
	config.lavalink_password,
	config.weeb_api_key,
	config.genius_access_token,

	config.top_api_key,
	config.botson_api_key,
	config.boats_api_key,
	config.dbl_api_key,
	config.botsgg_api_key,
	config.del_api_key
]

commands.assign([
	{
		usage: "<code>",
		description: "Executes arbitrary JavaScript in the bot process. Requires bot owner permissions",
		aliases: ["evaluate", "eval"],
		category: "admin",
		examples: ["eval client.token"],
		async process(msg, suffix, lang, prefixes) {
			const allowed = await utils.sql.hasPermission(msg.author, "eval")
			if (allowed) {
				if (!suffix) return msg.channel.send(lang.admin.evaluate.prompts.noInput)
				let result, depth
				depth = suffix.split("--depth:")[1]
				depth = depth ? depth.substring(0).split(" ")[0] : undefined
				if (!depth) depth = 0
				else {
					depth = Math.floor(Number(utils.parseBigInt(depth)))
					if (isNaN(depth)) depth = 0
					suffix = suffix.replace(`--depth:${suffix.split("--depth:")[1].substring(0).split(" ")[0]}`, "")
				}
				try {
					result = eval(suffix.replace(/client.token/g, `"${constants.fake_token}"`))
				} catch (e) {
					result = e
				}

				let output = await utils.stringify(result, depth, true)
				for (const item of replaceBlackList) {
					output = output.replace(new RegExp(item.replace(/\+/g, "\\+"), "g"), constants.fake_token)
				}

				/** @type {string | Discord.MessageAttachment} */
				let content = output
				if (output.length > 2000) content = new Discord.MessageAttachment(Buffer.from(output), "eval.txt")

				const menu = new InteractionMenu(msg.channel, [{ emoji: { id: null, name: "🗑" }, style: "DANGER", allowedUsers: [msg.author.id], remove: "message" }])
				const nmsg = await menu.create(typeof content === "string" ? { content } : { files: [content] })
				return setTimeout(() => {
					if (menu.menus.has(nmsg.id)) menu.destroy(true)
				}, 5 * 60 * 1000)
			} else return
		}
	},
	{
		usage: "<code>",
		description: "Executes a shell operation",
		aliases: ["execute", "exec"],
		category: "admin",
		examples: ["exec rm -rf /"],
		async process(msg, suffix, lang) {
			const allowed = await utils.sql.hasPermission(msg.author, "eval")
			if (!allowed) return
			if (!suffix) return msg.channel.send(lang.admin.execute.prompts.noInput)
			await msg.channel.sendTyping()
			require("child_process").exec(suffix, async (error, stdout, stderr) => {
				const result = new Discord.MessageEmbed()
				if (error) {
					result.setTitle(`Command exited with status code ${error.code}`)
					result.setColor(0xdd2d2d)
				} else {
					result.setTitle("Command exited with status code 0 (success)")
					result.setColor(0x2ddd2d)
				}
				function formatOutput(out) {
					if (typeof out !== "string") out = ""
					out = out.replace(/\x1B\[[0-9;]*[JKmsu]/g, "")
					if (out.length > 1000) out = `${out.slice(0, 999)}…`
					return out
				}
				if (stdout) result.addFields({ name: "stdout:", value: formatOutput(stdout) })
				if (stderr) result.addFields({ name: "stderr:", value: formatOutput(stderr) })
				if (!stdout && !stderr) result.setDescription("No output.")
				const menu = new InteractionMenu(msg.channel, [{ emoji: { id: null, name: "🗑" }, style: "DANGER", allowedUsers: [msg.author.id], remove: "message" }])
				const nmsg = await menu.create(await utils.contentify(msg.channel, result))
				return setTimeout(() => {
					if (menu.menus.has(nmsg.id)) menu.destroy(true)
				}, 5 * 60 * 1000)
			})
		}
	},
	{
		usage: "<amount> <user>",
		description: "Awards a specific user ",
		aliases: ["award"],
		category: "admin",
		examples: ["award 10000 PapiOphidian"],
		async process(msg, suffix, lang) {
			const allowed = await utils.sql.hasPermission(msg.author, "eval")
			if (!allowed) return
			if (msg.channel.type == "dm") return msg.channel.send(utils.replace(lang.admin.award.prompts.guildOnly, { "username": msg.author.username }))
			const args = suffix.split(" ")
			if (!args[0]) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidAmount, { "username": msg.author.username }))
			const award = utils.parseBigInt(args[0])
			if (!award) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidAmount, { "username": msg.author.username }))
			const usertxt = suffix.slice(args[0].length + 1)
			if (!usertxt) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidUser, { "username": msg.author.username }))
			const member = await utils.cacheManager.members.find(msg, usertxt)
			if (!member) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidUser, { "username": msg.author.username }))
			utils.coinsManager.award(member.id, award, `award from ${msg.author.id}`)
			const memlang = await utils.getLang(member.id, "self")
			const embed = new Discord.MessageEmbed()
				.setDescription(utils.replace(lang.admin.award.returns.channel, { "mention1": String(msg.author), "number": utils.numberComma(award), "mention2": String(member) }))
				.setColor(constants.money_embed_color)
			msg.channel.send(await utils.contentify(msg.channel, embed))
			return member.send(utils.replace(memlang.admin.award.returns.dm, { "mention": String(msg.author), "number": utils.numberComma(award) })).catch(() => msg.channel.send(lang.admin.award.prompts.dmFailed))
		}
	}
])
