// @ts-check

/** @type {import("node-fetch").default} */
// @ts-ignore
const fetch = require("node-fetch")
const Discord = require("thunderstorm")

const passthrough = require("../passthrough")
const { constants, config, commands, reloader } = passthrough

const key = config.chewey_api_key
const poweredbychewey = `Powered by ${constants.chewey_api}`.replace("https://", "")

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

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
		.setColor(constants.standard_embed_color)
		.setFooter(footer)
	return msg.channel.send(await utils.contentify(msg.channel, embed))
}

commands.assign([
	{
		usage: "None",
		description: "Returns an image of a cute cat",
		aliases: ["cat"],
		category: "images",
		examples: ["cat"],
		process(msg) {
			return sendImage("chewey", "cat", msg, "<a:CatLoading:426263491385622539>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of a cute doggo",
		aliases: ["dog", "doggo"],
		category: "images",
		examples: ["dog"],
		process(msg) {
			return sendImage("chewey", "dog", msg, "<a:CatLoading:426263491385622539>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of space",
		aliases: ["space"],
		category: "images",
		examples: ["space"],
		process(msg) {
			return sendImage("chewey", "space", msg, "<a:SpaceLoading:429061691633041419>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of a snek",
		aliases: ["snek", "snake"],
		category: "images",
		examples: ["snek"],
		process(msg) {
			return sendImage("chewey", "snake", msg, "<a:CatLoading:426263491385622539>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of a birb",
		aliases: ["birb", "bird"],
		category: "images",
		examples: ["birb"],
		process(msg) {
			return sendImage("chewey", "birb", msg, "<a:CatLoading:426263491385622539>", poweredbychewey)
		}
	},
	{
		usage: "None",
		description: "Returns an image of a catgirl (ฅ’ω’ฅ)",
		aliases: ["catgirl", "neko"],
		category: "images",
		examples: ["neko"],
		/**
		 * @param {import("thunderstorm").Message} msg
		 * @param {string} suffix
		 * @param {import("@amanda/lang").Lang} lang
		 */
		process(msg, suffix, lang) {
			return sendImage("nekos", "neko", msg, "<a:NekoSway:461420549990776832>", "Powered by nekos.life").catch(async () => {
				const embed = new Discord.MessageEmbed()
					.setTitle(lang.images.catgirl.returns.error)
					.setDescription(lang.images.catgirl.returns.offline)
					.setImage("https://cdn.discordapp.com/attachments/413088092556361728/632513720593022997/6439473d9cea838eae9161dad09927ae.png")
					.setColor(constants.standard_embed_color)
				msg.channel.send(await utils.contentify(msg.channel, embed))
			})
		}
	}
])
