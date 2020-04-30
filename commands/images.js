// @ts-check

/** @type {import("node-fetch").default} */
// @ts-ignore
const fetch = require("node-fetch")
const Discord = require("discord.js")

const passthrough = require("../passthrough")
const { constants, config, commands, reloader } = passthrough

const key = config.chewey_api_key
const poweredbychewey = `Powered by ${constants.chewey_api}`.replace("https://", "")

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities.js", utils)

/**
 * @param {string} host
 * @param {string} path
 * @param {Discord.Message} msg
 * @param {string} emoji
 * @param {string} footer
 * @returns {Promise<Discord.Message>}
 */
async function sendImage(host, path, msg, emoji, footer) {
	let url
	if (host == "chewey") url = `${constants.chewey_api}/${path}?auth=${key}`
	else if (host == "nekos") url = `https://nekos.life/api/v2/img/${path}`
	else return Promise.reject(new Error("Host provided not supported"))
	const data = await fetch(url, { timeout: 2000 }).then(d => d.json())
	let img
	if (host == "chewey") img = data.data
	else if (host == "nekos") img = data.url
	const embed = new Discord.MessageEmbed()
		.setImage(img)
		.setColor("36393E")
		.setFooter(footer)
	return msg.channel.send(utils.contentify(msg.channel, embed))
}

commands.assign([
	{
		usage: "None",
		description: "Returns an image of a cute cat",
		aliases: ["cat"],
		category: "images",
		example: "&cat",
		process(msg) {
			return sendImage("chewey", "cat", msg, "<a:CatLoading:426263491385622539>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of a cute doggo",
		aliases: ["dog", "doggo"],
		category: "images",
		example: "&dog",
		process(msg) {
			return sendImage("chewey", "dog", msg, "<a:CatLoading:426263491385622539>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of space",
		aliases: ["space"],
		category: "images",
		example: "&space",
		process(msg) {
			return sendImage("chewey", "space", msg, "<a:SpaceLoading:429061691633041419>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of a snek",
		aliases: ["snek", "snake"],
		category: "images",
		example: "&snek",
		process(msg) {
			return sendImage("chewey", "snake", msg, "<a:CatLoading:426263491385622539>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of a birb",
		aliases: ["birb", "bird"],
		category: "images",
		example: "&birb",
		process(msg) {
			return sendImage("chewey", "birb", msg, "<a:CatLoading:426263491385622539>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of a catgirl (ฅ’ω’ฅ)",
		aliases: ["catgirl", "neko"],
		category: "images",
		example: "&neko",
		process(msg, suffix, lang) {
			return sendImage("nekos", "neko", msg, "<a:NekoSway:461420549990776832>", "Powered by nekos.life").catch(() => {
				const embed = new Discord.MessageEmbed()
					.setTitle(lang.images.catgirl.returns.error)
					.setDescription(lang.images.catgirl.returns.offline)
					.setImage("https://cdn.discordapp.com/attachments/413088092556361728/632513720593022997/6439473d9cea838eae9161dad09927ae.png")
					.setColor(0x36393f)
				msg.channel.send(embed)
			})
		}
	}
])
