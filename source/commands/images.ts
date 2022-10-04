import passthrough from "../passthrough"
const { constants, config, commands, client } = passthrough

const poweredbychewey = `Powered by ${constants.chewey_api}`.replace(/https?:\/\//, "")

async function sendImage(host: string, path: string, cmd: import("../modules/Command"), footer: string) {
	let url: string
	if (host == "chewey") url = `${constants.chewey_api}/${path}?auth=${config.chewey_api_key}`
	else return Promise.reject(new Error("Host provided not supported"))
	const data = await fetch(url).then(d => d.json())
	return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
		embeds: [
			{
				color: constants.standard_embed_color,
				image: {
					url: data.data
				},
				footer: {
					text: footer
				}
			}
		]
	})
}

commands.assign([
	{
		name: "image",
		description: "Send an image of something",
		category: "images",
		options: [
			{
				name: "type",
				type: 3,
				description: "The type of image",
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
						value: "bird"
					}
				],
				required: true
			}
		],
		async process(cmd) {
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })
			const type = cmd.data.options.get("type")!.asString()
			const onFail = () => client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: "There was an error fetching the image" })
			if (type === "cat") return sendImage("chewey", "cat", cmd, poweredbychewey).catch(onFail)
			else if (type === "dog") return sendImage("chewey", "dog", cmd, poweredbychewey).catch(onFail)
			else if (type === "space") return sendImage("chewey", "space", cmd, poweredbychewey).catch(onFail)
			else if (type === "snake") return sendImage("chewey", "snake", cmd, poweredbychewey).catch(onFail)
			else if (type === "bird") return sendImage("chewey", "birb", cmd, poweredbychewey).catch(onFail)
		}
	}
])
