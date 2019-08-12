const rp = require("request-promise");
const Discord = require("discord.js");

const Structures = require("../modules/structures")

// @ts-ignore
require("../types.js");

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { config, client, commands, reloader } = passthrough;
	let key = config.chewey_api_key;

	let lang = require("../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);

	let utils = require("../modules/utilities")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	/**
	 * @param {String} host
	 * @param {String} path
	 * @param {Structures.Message} msg
	 * @param {String} emoji
	 * @param {String} footer
	 * @returns {Promise<Structures.Message>}
	 */
	async function sendImage(host, path, msg, emoji, footer) {
		let url;
		if (host == "chewey") url = `https://api.chewey-bot.ga/${path}?auth=${key}`;
		else if (host == "nekos") url = `https://nekos.life/api/v2/img/${path}`;
		else return Promise.reject("Host provided not supported");
		let [nmsg, body] = await Promise.all([
			msg.channel.send(emoji),
			rp(url)
		]);
		let data;
		try {
			data = JSON.parse(body);
		} catch (error) { return nmsg.edit(lang.apiError(error)); }
		let img;
		if (host == "chewey") img = data.data;
		else if (host == "nekos") img = data.url;
		else img = undefined; // excuse me what
		let embed = new Discord.MessageEmbed()
			.setImage(img)
			.setColor('36393E')
			.setFooter(footer)
		return nmsg.edit("", utils.contentify(nmsg.channel, embed));
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
		"neko": {
			usage: "None",
			description: "Returns an image of a neko (ฅ’ω’ฅ)",
			aliases: ["neko"],
			category: "images",
			process: function(msg) {
				return sendImage("nekos", "neko", msg, "<a:NekoSway:461420549990776832>", "Powered by nekos.life");
			}
		}
	});
}
