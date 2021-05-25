const { ipc, snow } = require("../../passthrough")

ipc.replier.addReceivers([
	["REPLY_GET_GUILD_MEMBER", {
		op: "GET_GUILD_MEMBER",
		fn: ({ userID, guildID }) => {
			return new Promise(resolve => {
				snow.guild.getGuildMember(guildID, userID)
				.then(result => resolve({ status: "ok", data: result }))
				.catch(e => resolve({ status: "error", data: e }))
			})
		}
	}]
])
