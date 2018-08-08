const crypto = require("crypto");
const util = require("util");
const fs = require("fs");

module.exports = function ({utils, client}) {
	const extra = {
		salt: function(length = 32) {
			return Buffer.from(Array(length).fill().map(a => Math.random()*80+32)).toString();
		},
		hash: function(data) {
			return crypto.createHash("sha256").update(data).digest("hex");
		},
		checkToken: async function(data, resolve, callback) {
			if (!data || typeof(data.token) != "string") return resolve([400, "No token"]);
			let userRow = await utils.get("SELECT WebTokens.userID, music FROM WebTokens LEFT JOIN UserPermissions ON UserPermissions.userID = WebTokens.userID WHERE token = ?", data.token);
			if (!userRow) return resolve([401, "Bad token"]);
			callback(userRow);
		},
		checkTokenWS: async function(data, ws, callback) {
			if (!data || typeof(data.token) != "string") return ws.removeAllListeners();
			let userRow = await utils.get("SELECT WebTokens.userID, music FROM WebTokens LEFT JOIN UserPermissions ON UserPermissions.userID = WebTokens.userID WHERE token = ?", data.token);
			if (!userRow) return ws.removeAllListeners();
			callback(userRow);
		},
		getMusicGuilds: async function(userID, hasPremium) {
			if (hasPremium === undefined) {
				hasPremium = (await utils.get("SELECT music FROM UserPermissions WHERE userID = ?", userID)).music;
			}
			let guilds = client.guilds.filter(g => g.members.get(userID));
			if (hasPremium) {
				return guilds;
			} else {
				let musicGuilds = await utils.sql("SELECT serverID FROM ServerPermissions WHERE music = 1");
				musicGuilds = musicGuilds.map(r => r.serverID);
				guilds = guilds.filter(g => musicGuilds.includes(g.id));
				return guilds;
			}
		}
	};
	return extra;
}