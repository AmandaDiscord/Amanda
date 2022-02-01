import c from "centra"
import Discord from "thunderstorm"

import passthrough from "../passthrough"
const { constants, config, commands } = passthrough

const poweredbychewey = `Powered by ${constants.chewey_api}`.replace(/https?:\/\//, "")

async function sendImage(host: string, path: string, cmd: import("thunderstorm").CommandInteraction, footer: string): Promise<import("thunderstorm").Message> {
	let url: string
	if (host == "chewey") url = `${constants.chewey_api}/${path}?auth=${config.chewey_api_key}`
	else if (host == "nekos") url = `https://nekos.life/api/v2/img/${path}`
	else return Promise.reject(new Error("Host provided not supported"))
	const data = await c(url).timeout(2000).send().then(d => d.json())
	let img = ""
	if (host == "chewey") img = data.data
	else if (host == "nekos") img = data.url
	const embed = new Discord.MessageEmbed()
		.setImage(img)
		.setColor(constants.standard_embed_color)
		.setFooter(footer)
	return cmd.editReply({ embeds: [embed] })
}

commands.assign([
	{
		name: "image",
		description: "Send an image of something",
		category: "images",
		options: [
			{
				name: "type",
				type: Discord.Constants.ApplicationCommandOptionTypes.STRING,
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
					},
					{
						name: "neko",
						value: "neko"
					}
				],
				required: true
			}
		],
		async process(cmd, lang) {
			await cmd.defer()
			const type = cmd.options.getString("type") as string
			const onFail = () => cmd.editReply("There was an error fetching the image")
			if (type === "cat") return sendImage("chewey", "cat", cmd, poweredbychewey).catch(onFail)
			else if (type === "dog") return sendImage("chewey", "dog", cmd, poweredbychewey).catch(onFail)
			else if (type === "space") return sendImage("chewey", "space", cmd, poweredbychewey).catch(onFail)
			else if (type === "snake") return sendImage("chewey", "snake", cmd, poweredbychewey).catch(onFail)
			else if (type === "bird") return sendImage("chewey", "birb", cmd, poweredbychewey).catch(onFail)
			else if (type === "neko") {
				return sendImage("nekos", "neko", cmd, "Powered by nekos.life").catch(() => {
					const embed = new Discord.MessageEmbed()
						.setTitle(lang.images.catgirl.returns.error)
						.setDescription(lang.images.catgirl.returns.offline)
						.setImage("https://cdn.discordapp.com/attachments/413088092556361728/632513720593022997/6439473d9cea838eae9161dad09927ae.png")
						.setColor(constants.standard_embed_color)
					cmd.editReply({ embeds: [embed] })
				})
			}
		}
	}
])
