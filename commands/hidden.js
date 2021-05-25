const Discord = require("thunderstorm")

const passthrough = require("../passthrough")
const { commands, client, constants, sync } = passthrough

/** @type {import("../modules/utilities")} */
const utils = sync.require("../modules/utilities")

commands.assign([
	{
		usage: "None",
		description: "same energy as https://cdn.discordapp.com/attachments/649351366736740352/768063300566122516/unknown.png",
		aliases: ["sit"],
		category: "hidden",
		examples: ["amanda, sit"],
		async process(msg, suffix, lang) {
			if (!msg.content.startsWith(`${client.user.username.toLowerCase()}, `)) return
			const embed = new Discord.MessageEmbed()
				.setColor(constants.standard_embed_color)
				.setImage("https://cdn.discordapp.com/attachments/608456955660468224/777735506703810560/chibiv3.png")
			return msg.channel.send(await utils.contentify(msg.channel, embed))
		}
	}
])
