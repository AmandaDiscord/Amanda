const crypto = require("crypto");
const util = require("util");
const fs = require("fs");

const tokenRegex = /^[0-9a-f]{64}$/;

module.exports = function ({utils, client}) {
	let trackedMessage = {msg: undefined, breakdown: {}, lastEdit: 0, editTimeout: setTimeout(new Function())};
	client.once("ready", () => {
		let ids = {
			"378773803225841668": ["399308090832453642", "493680834403106817"],
			"405208699313848330": ["483504430365278209", "493673296508878848"]
		};
		client.channels.get(ids[client.user.id][0]).fetchMessage(ids[client.user.id][1]).then(msg => {
			trackedMessage.msg = msg;
			msg.content.split("\n").forEach(line => {
				let values = line.split(": ");
				trackedMessage.breakdown[values[0]] = values[1];
			});
		});
	});
	const extra = {
		salt: function(length = 32) {
			return Buffer.from(Array(length).fill().map(a => Math.random()*80+32)).toString();
		},
		hash: function(data) {
			return crypto.createHash("sha256").update(data).digest("hex");
		},
		checkToken: async function(data, resolve, callback) {
			if (!data || typeof(data.token) != "string" || !data.token.match(tokenRegex)) return resolve([400, "No token"]);
			let userRow = await utils.sql.get("SELECT WebTokens.userID, music FROM WebTokens LEFT JOIN UserPermissions ON UserPermissions.userID = WebTokens.userID WHERE token = ?", data.token);
			if (!userRow) return resolve([401, "Bad token"]);
			callback(userRow);
		},
		checkTokenWS: async function(data, ws, callback) {
			if (!data || typeof(data.token) != "string" || !data.token.match(tokenRegex)) return ws.removeAllListeners();
			let userRow = await utils.sql.get("SELECT WebTokens.userID, music FROM WebTokens LEFT JOIN UserPermissions ON UserPermissions.userID = WebTokens.userID WHERE token = ?", data.token);
			if (!userRow) return ws.removeAllListeners();
			callback(userRow);
		},
		getMusicGuilds: async function(userID, hasPremium) {
			if (hasPremium === undefined) {
				hasPremium = (await utils.sql.get("SELECT music FROM UserPermissions WHERE userID = ?", userID)).music;
			}
			let guilds = client.guilds.filter(g => g.members.get(userID));
			if (hasPremium) {
				return guilds;
			} else {
				let musicGuilds = await utils.sql.all("SELECT serverID FROM ServerPermissions WHERE music = 1");
				musicGuilds = musicGuilds.map(r => r.serverID);
				guilds = guilds.filter(g => musicGuilds.includes(g.id));
				return guilds;
			}
		},
		trackImageUsage: async function(d) {
			if (!trackedMessage.msg) return;
			d = String(d);
			if (trackedMessage.breakdown[d]) trackedMessage.breakdown[d]++;
			else trackedMessage.breakdown[d] = 1;
			if (Date.now() - trackedMessage.lastEdit > 10000) {
				edit();
			} else {
				if (trackedMessage.editTimeout._called) {
					trackedMessage.editTimeout = setTimeout(edit, 10000 - (Date.now() - trackedMessage.lastEdit));
				}
			}
			function edit() {
				trackedMessage.lastEdit = Date.now();
				let content = Object.keys(trackedMessage.breakdown).map(k => k+": "+trackedMessage.breakdown[k]).join("\n");
				trackedMessage.msg.edit(content);
			}
		}
	};
	return extra;
}