import Discord from "thunderstorm"

import passthrough from "../passthrough"
const { commands, constants } = passthrough

commands.assign([
	{
		name: "sit",
		description: "mood",
		category: "hidden",
		process(cmd) {
			const embed = new Discord.MessageEmbed()
				.setColor(constants.standard_embed_color)
				.setImage("https://cdn.discordapp.com/attachments/608456955660468224/777735506703810560/chibiv3.png")
			return cmd.reply({ embeds: [embed] })
		}
	}
])
