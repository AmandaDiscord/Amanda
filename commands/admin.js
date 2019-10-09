//@ts-check

const Discord = require("discord.js")
const rp = require("request-promise")
const util = require("util")
const path = require("path")

const passthrough = require("../passthrough")
let { config, client, commands, db, reloader, reloadEvent, gameStore, queueStore } = passthrough

let utils = require("../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

let common = require("./music/common.js")
reloader.useSync("./commands/music/common.js", common)

commands.assign({
	"evaluate": {
		usage: "<code>",
		description: "Executes arbitrary JavaScript in the bot process. Requires bot owner permissions",
		aliases: ["evaluate", "eval"],
		category: "admin",
		process: async function (msg, suffix, lang) {
			let allowed = await utils.hasPermission(msg.author, "eval")
			if (allowed) {
				if (!suffix) return msg.channel.send(lang.admin.evaluate.prompts.noInput)
				let result, depth
				depth = suffix.split("--depth:")[1]
				depth?depth=depth.substring(0).split(" ")[0]:undefined
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
				let output = await utils.stringify(result, depth)
				let nmsg = await msg.channel.send(output.replace(new RegExp(client.token, "g"), config.fake_token))
				let menu = utils.reactionMenu(nmsg, [{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }])
				return setTimeout(() => menu.destroy(true), 5*60*1000)
			} else return
		}
	},
	"execute": {
		usage: "<code>",
		description: "Executes a shell operation",
		aliases: ["execute", "exec"],
		category: "admin",
		process: async function (msg, suffix, lang) {
			let allowed = await utils.hasPermission(msg.author, "eval")
			if (!allowed) return
			if (!suffix) return msg.channel.send(lang.admin.execute.prompts.noInput)
			await msg.channel.sendTyping()
			require("child_process").exec(suffix, async (error, stdout, stderr) => {
				let result
				if (error) result = error
				else if (stdout) result = stdout
				else if (stderr) result = stderr
				else result = "No output"
				result = result.toString()
				if (result.length >= 2000) result = result.slice(0, 1993)+"…"
				let nmsg = await msg.channel.send(`\`\`\`\n${result}\n\`\`\``)
				let menu = utils.reactionMenu(nmsg, [{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }])
				return setTimeout(() => menu.destroy(true), 5*60*1000)
			})
			return
		}
	},
	"award": {
		usage: "<amount> <user>",
		description: "Awards a specific user ",
		aliases: ["award"],
		category: "admin",
		process: async function(msg, suffix, lang) {
			let allowed = await utils.hasPermission(msg.author, "eval")
			if (!allowed) return
			if (msg.channel.type == "dm") return msg.channel.send(utils.replace(lang.admin.award.prompts.guildOnly, {"username": msg.author.username}))
			let args = suffix.split(" ")
			if (!args[0]) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidAmount, {"username": msg.author.username}))
			let award = Math.floor(Number(args[0]))
			if (isNaN(award)) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidAmount, {"username": msg.author.username}))
			let usertxt = suffix.slice(args[0].length + 1)
			if (!usertxt) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidUser, {"username": msg.author.username}))
			let member = await msg.guild.findMember(msg, usertxt)
			if (!member) return msg.channel.send(utils.replace(lang.admin.award.prompts.invalidUser, {"username": msg.author.username}))
			utils.coinsManager.award(member.id, award)
			let embed = new Discord.MessageEmbed()
				.setDescription(utils.replace(lang.admin.award.returns.channel, {"mention1": String(msg.author), "number": award, "mention2": String(member)}))
				.setColor(0xf8e71c)
			msg.channel.send(utils.contentify(msg.channel, embed))
			return member.send(utils.replace(lang.admin.award.returns.dm, {"mention": String(msg.author), "number": award})).catch(() => msg.channel.send(lang.admin.award.prompts.dmFailed))
		}
	}
})
