const rp = require("request-promise");
const util = require("util");
const fs = require("fs");

const dblCacheRefreshTime = 1000*60*60;

let dblLastCache = 0;

async function dblUpdateCache() {
	console.log("Updating DBL image cache...");
	let img = await rp("https://discordbots.org/api/widget/405208699313848330.png", {encoding: null});
	await util.promisify(fs.writeFile)("dblimg.png", img, {encoding: null});
	console.log("Updated DBL image cache.");
	dblLastCache = Date.now();
}
dblUpdateCache();

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
		},
		{
			route: "/dblimg.png", methods: ["GET"], code: async () => {
				if (Date.now()-dblLastCache > dblCacheRefreshTime) {
					await dblUpdateCache();
				}
				let img = await util.promisify(fs.readFile)("dblimg.png", {encoding: null});
				return {
					statusCode: 200,
					contentType: "image/png",
					content: img,
					headers: {
						"Cache-Control": `max-age=${Math.floor((dblCacheRefreshTime+dblLastCache-Date.now())/1000)+10}, public`
					}
				}
			}
		}
	]
}