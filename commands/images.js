//@ts-check

const rp = require("request-promise")
const Discord = require("discord.js")

const passthrough = require("../passthrough")
let { config, client, commands, reloader } = passthrough

const key = config.chewey_api_key

let lang = require("../modules/lang.js")
reloader.useSync("./modules/lang.js", lang)

let utils = require("../modules/utilities")
reloader.useSync("./modules/utilities.js", utils)

/**
 * @param {string} host
 * @param {string} path
 * @param {Discord.Message} msg
 * @param {string} emoji
 * @param {string} footer
 * @returns {Promise<Discord.Message>}
 */
async function sendImage(host, path, msg, emoji, footer) {
	let url;
	if (host == "chewey") url = `https://api.chewey-bot.ga/${path}?auth=${key}`;
	else if (host == "nekos") url = `https://nekos.life/api/v2/img/${path}`;
	else return Promise.reject("Host provided not supported");
	let data = await rp(url, {json: true})
	if (host == "chewey") var img = data.data;
	else if (host == "nekos") var img = data.url;
	let embed = new Discord.MessageEmbed()
		.setImage(img)
		.setColor('36393E')
		.setFooter(footer)
	return msg.channel.send(utils.contentify(msg.channel, embed));
}

commands.assign({
	"cat": {
		usage: "None",
		description: "Returns an image of a cute cat",
		aliases: ["cat"],
		category: "images",
		process: function(msg) {
			return sendImage("chewey", "cat", msg, "<a:CatLoading:426263491385622539>", "Powered by api.chewey-bot.ga");
		}
	},
	"dog": {
		usage: "None",
		description: "Returns an image of a cute doggo",
		aliases: ["dog", "doggo"],
		category: "images",
		process: function(msg) {
			return sendImage("chewey", "dog", msg, "<a:CatLoading:426263491385622539>", "Powered by api.chewey-bot.ga");
		}
	},
	"space": {
		usage: "None",
		description: "Returns an image of space",
		aliases: ["space"],
		category: "images",
		process: function(msg) {
			return sendImage("chewey", "space", msg, "<a:SpaceLoading:429061691633041419>", "Powered by api.chewey-bot.ga");
		}
	},
	"snek": {
		usage: "None",
		description: "Returns an image of a snek",
		aliases: ["snek", "snake"],
		category: "images",
		process: async function(msg) {
			return sendImage("chewey", "snake", msg, "<a:CatLoading:426263491385622539>", "Powered by api.chewey-bot.ga");
		}
	},
	"birb": {
		usage: "None",
		description: "Returns an image of a birb",
		aliases: ["birb", "bird"],
		category: "images",
		process: async function(msg) {
			return sendImage("chewey", "birb", msg, "<a:CatLoading:426263491385622539>", "Powered by api.chewey-bot.ga");
		}
	},
	"catgirl": {
		usage: "None",
		description: "Returns an image of a catgirl (ฅ’ω’ฅ)",
		aliases: ["catgirl", "neko"],
		category: "images",
		process: function(msg) {
			return sendImage("nekos", "neko", msg, "<a:NekoSway:461420549990776832>", "Powered by nekos.life");
		}
	}
});
