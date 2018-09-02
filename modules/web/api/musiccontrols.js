module.exports = ({client, utils, extra, reloadEvent}) => {
	return [
		{
			route: "/api/music/([0-9]+)/(\\w+)", methods: ["POST"], code: ({fill, data}) => {
				return new Promise(async resolve => {
					extra.checkToken(data, resolve, async userRow => {
						if (!client.guilds.get(fill[0]) || !client.guilds.get(fill[0]).members.get(userRow.userID)) return resolve([403, "Not in that server"]);
						let guilds = await extra.getMusicGuilds(userRow.userID, userRow.music);
						if (!guilds.find(g => g.id == fill[0])) return resolve([403, "Not allowed to use music"]);
						reloadEvent.emit("music", fill[1], fill[0], resolve);
					});
				});
			},
		}
	]
}