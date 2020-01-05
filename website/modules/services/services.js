const { ipc, snow, reloader } = require("../../passthrough")

ipc.replier.addReceivers([
	["REPLY_GET_GUILD_MEMBER", {
		op: "GET_GUILD_MEMBER",
		fn: ({ userID, guildID }) => {
			return snow.guild.getGuildMember(guildID, userID)
		}
	}]
])
