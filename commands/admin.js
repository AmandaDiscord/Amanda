// @ts-check

const Discord = require("discord.js")
const fetch = require("node-fetch")
const util = require("util")
const path = require("path")
const ReactionMenu = require("@amanda/reactionmenu")

const passthrough = require("../passthrough")
const { config, constants, client, commands, db, reloader, reloadEvent, games, queues, streaks, frisky, weeb } = passthrough

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

const common = require("./music/common.js")
reloader.sync("./commands/music/common.js", common)

commands.assign([
	{
		usage: "<code>",
		description: "Executes arbitrary JavaScript in the bot process. Requires bot owner permissions",
		aliases: ["evaluate", "eval"],
		category: "admin",
		example: "&eval client.token",
		async process(msg, suffix, lang) {
			const allowed = await utils.sql.hasPermission(msg.author, "eval")
			if (allowed) {
				if (!suffix) return msg.channel.send(lang.admin.evaluate.prompts.noInput)
				let result, depth
				depth = suffix.split("--depth:")[1]
				depth ? depth = depth.substring(0).split(" ")[0] : undefined
				if (!depth) depth = 0
				else {
					depth = Math.floor(Number(depth))
					if (isNaN(depth)) depth = 0
					suffix = suffix.replace(`--depth:${suffix.split("--depth:")[1].substring(0).split(" ")[0]}`, "")
				}
				try {
					result = eval(suffix.replace(/client.token/g, `"${config.fake_token}"`))
				} catch (e) {
					result = e
				}
				const output = await utils.stringify(result, depth)
				const nmsg = await msg.channel.send(output.replace(new RegExp(client.token, "g"), config.fake_token))
				const menu = new ReactionMenu(nmsg, [{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }])
				return setTimeout(() => menu.destroy(true), 5 * 60 * 1000)
			} else return
		}
	},
	{
		usage: "<code>",
		description: "Executes a shell operation",
		aliases: ["execute", "exec"],
		category: "admin",
		example: "&exec rm -rf /",
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
				const nmsg = await msg.channel.send(utils.contentify(msg.channel, result))
				const menu = new ReactionMenu(nmsg, [{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }])
				return setTimeout(() => menu.destroy(true), 5 * 60 * 1000)
			})
			return
		}
	},
	{
		usage: "<amount> <user>",
		description: "Awards a specific user ",
		aliases: ["award"],
		category: "admin",
		example: "&award 10000 PapiOphidian",
		async process(msg, suffix, lang) {
			const allowed = await utils.sql.hasPermission(msg.author, "eval")
			if (!allowed) return
			if (msg.channel.type == "dm") return msg.channel.send(utils.replace(lang.admin.award.prompts.guildOnly, { "username": msg.author.username }))
			const args = suffix.split(" ")
			if (!args[0]) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidAmount, { "username": msg.author.username }))
			const award = Math.floor(Number(args[0]))
			if (isNaN(award)) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidAmount, { "username": msg.author.username }))
			const usertxt = suffix.slice(args[0].length + 1)
			if (!usertxt) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidUser, { "username": msg.author.username }))
			const member = await utils.findMember(msg, usertxt)
			if (!member) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidUser, { "username": msg.author.username }))
			utils.coinsManager.award(member.id, award)
			const memlang = await utils.getLang(member.id, "self")
			const embed = new Discord.MessageEmbed()
				.setDescription(utils.replace(lang.admin.award.returns.channel, { "mention1": String(msg.author), "number": award, "mention2": String(member) }))
				.setColor(constants.money_embed_color)
			msg.channel.send(utils.contentify(msg.channel, embed))
			return member.send(utils.replace(memlang.admin.award.returns.dm, { "mention": String(msg.author), "number": award })).catch(() => msg.channel.send(lang.admin.award.prompts.dmFailed))
		}
	}
])
