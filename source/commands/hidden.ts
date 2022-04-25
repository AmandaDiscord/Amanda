import passthrough from "../passthrough"
const { commands, constants, client } = passthrough

commands.assign([
	{
		name: "sit",
		description: "mood",
		category: "hidden",
		process(cmd) {
			return client.snow.interaction.createInteractionResponse(cmd.application_id, cmd.token, {
				type: 4,
				data: {
					embeds: [
						{
							color: constants.standard_embed_color,
							image: {
								url: "https://cdn.discordapp.com/attachments/608456955660468224/777735506703810560/chibiv3.png"
							}
						}
					]
				}
			})
		}
	}
])
