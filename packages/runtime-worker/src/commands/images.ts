import passthrough = require("../passthrough")
const { confprovider, commands, client } = passthrough

import type { ChatInputCommand } from "@amanda/commands"

import { en_us as English } from "@amanda/lang"
import { ComponentType, MessageFlags } from "discord-api-types/v10"

const poweredbychewey = `Powered by ${confprovider.config.chewey_api_url}`.replace(/https?:\/\//, "")

async function sendImage(host: string, path: string, cmd: ChatInputCommand, footer: string) {
	let url = ""
	if (host === "chewey") url = `${confprovider.config.chewey_api_url}/${path}?auth=${confprovider.config.chewey_token}`
	else return Promise.reject(new Error("Host provided not supported"))
	const data = await fetch(url).then(d => d.json())
	return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
		// @ts-ignore
		flags: MessageFlags.IsComponentsV2,
		components: [
			{
				type: ComponentType.MediaGallery,
				items: [
					{
						media: {
							url: data.data
						}
					}
				]
			},
			{
				type: ComponentType.TextDisplay,
				content: footer
			}
		]
	})
}

commands.assign([
	{
		name: English.image.name,
		description: English.image.description,
		category: "images",
		integration_types: [0, 1],
		contexts: [0, 1, 2],
		options: [
			{
				name: English.image.options.type.name,
				type: 3,
				description: English.image.options.type.description,
				choices: [
					{
						name: "cat",
						value: "cat"
					},
					{
						name: "dog",
						value: "dog"
					},
					{
						name: "space",
						value: "space"
					},
					{
						name: "snake",
						value: "snake"
					},
					{
						name: "bird",
						value: "birb"
					}
				],
				required: true
			}
		],
		process(cmd, lang) {
			const type = cmd.data.options.get("type")!.asString()
			const onFail = () => client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.IMAGE_FETCH_FAILED })

			switch (type) {
			case "cat":
			case "dog":
			case "space":
			case "snake":
			case "birb":
				return sendImage("chewey", type, cmd, poweredbychewey).catch(onFail)
			default: break
			}
		}
	}
])
