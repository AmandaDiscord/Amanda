const rp = require("request-promise");
const util = require("util");
const fs = require("fs");

module.exports = (passthrough) => {
	const {client, utils, extra, reloadEvent} = passthrough;
	return [
		{
			route: "/api/sharedservers", methods: ["POST"], code: ({fill, data}) => {
				return new Promise(async resolve => {
					extra.checkToken(data, resolve, async userRow => {
						let guilds = await extra.getMusicGuilds(userRow.userID, userRow.music);
						guilds = guilds.map(g => ({id: g.id, icon: g.icon, name: g.name}));
						return resolve([200, guilds]);
					});
				});
			}
		},
		{
			route: "/api/userid", methods: ["POST"], code: ({data}) => {
				return new Promise(async resolve => {
					extra.checkToken(data, resolve, async userRow => {
						resolve([200, {userID: userRow.userID}]);
					});
				});
			}
		}
	]
}