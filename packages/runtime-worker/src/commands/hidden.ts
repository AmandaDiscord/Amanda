import passthrough = require("../passthrough")
const { commands, client, confprovider } = passthrough

commands.assign([
	{
		name: "sit",
		description: "mood",
		category: "hidden",
		process(cmd) {
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						color: confprovider.config.standard_embed_color,
						image: {
							url: "https://cdn.discordapp.com/attachments/608456955660468224/777735506703810560/chibiv3.png"
						}
					}
				]
			})
		}
	}
])
