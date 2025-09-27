import { ComponentType, MessageFlags } from "discord-api-types/v10"
import passthrough = require("../passthrough")
const { commands, client, confprovider } = passthrough

import { en_us as English } from "@amanda/lang"

commands.assign([
	{
		name: English.sit.name,
		description: English.sit.description,
		category: "hidden",
		integration_types: [0, 1],
		contexts: [0, 1, 2],
		process(cmd) {
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				flags: MessageFlags.IsComponentsV2,
				components: [
					{
						type: ComponentType.MediaGallery,
						items: [
							{
								media: {
									url: "https://b.catgirlsare.sexy/QSiJKTO0-z7i.png"
								}
							}
						]
					}
				]
			})
		}
	}
])
