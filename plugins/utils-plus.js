module.exports = function(passthrough) {
	let { Config, Discord, client, djs, dio, reloadEvent, utils, db, dbs, commands } = passthrough;

	utils.hasPermission = async function() {
		let args = [...arguments];
		let thing, thingType, permissionType;
		if (typeof(args[0]) == "object") {
			thing = args[0].id;
			if (args[0].constructor.name == "Guild") thingType = "server";
			else thingType = "user";
			permissionType = args[1];
		} else {
			[thing, thingType, permissionType] = args;
		}
		let result;
		if (thingType == "user" || thingType == "member") {
			result = await dbs[2].get(`SELECT ${permissionType} FROM UserPermissions WHERE userID = ?`, thing);
		} else if (thingType == "server" || thingType == "guild") {
			result = await dbs[2].get(`SELECT ${permissionType} FROM ServerPermissions WHERE serverID = ?`, thing);
		}
		if (result) result = Object.values(result)[0];
		return !!result;
	}

	utils.sendNopeMessage = function(msg) {
		const nope = [["no", 300], ["Nice try", 1000], ["How about no?", 1550], [`Don't even try it ${msg.author.username}`, 3000]];
		let [no, time] = nope[Math.floor(Math.random() * nope.length)];
		dio.simulateTyping(msg.channel.id);
		setTimeout(() => {
			msg.channel.send(no);
		}, time);
	}

	/**
 * Gets data from the MySQL database
 * @param {String} data A Discord Snowflake
 * @returns {*} A user's information in the database
 */
utils.get = function(data) {
	return new Promise(function(resolve, reject) {
		db.query("SELECT * FROM `money` WHERE `userID` =?", data, function(reason, row) {
			if (reason) reject(reason);
			if (!row) {
				db.query("INSERT INTO money (userID, coins) VALUES (?, ?)", [data, 5000], function(err, data) {
					if (err) reject(err);
					resolve(data);
				});
			} else resolve(row[0]);
		});
	});
}

	return {};
}