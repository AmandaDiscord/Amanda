module.exports = function(passthrough) {
	let { Discord, client, djs, dio, reloadEvent, utils, db, commands } = passthrough;

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
			result = await utils.get(`SELECT ${permissionType} FROM UserPermissions WHERE userID = ?`, thing);
		} else if (thingType == "server" || thingType == "guild") {
			result = await utils.get(`SELECT ${permissionType} FROM ServerPermissions WHERE serverID = ?`, thing);
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

	utils.getConnection = function() {
		return db.getConnection();
	}

	utils.sql = function(string, prepared, connection, attempts) {
		if (!attempts) attempts = 2;
		if (!connection) connection = db;
		if (prepared !== undefined && typeof(prepared) != "object") prepared = [prepared];
		return new Promise((resolve, reject) => {
			connection.execute(string, prepared).then(result => {
				let rows = result[0];
				resolve(rows);
			}).catch(err => {
				console.error(err);
				attempts--;
				if (attempts) utils.sql(string, prepared, connection, attempts).then(resolve).catch(reject);
				else reject(err);
			});
		});
	}

	utils.get = async function(string, prepared, connection) {
		return (await utils.sql(string, prepared, connection))[0];
	}

	return {};
}