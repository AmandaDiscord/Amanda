const bots = [
	["405208699313848330", "&"],
	["160105994217586689", ">"]
];

module.exports = function(passthrough) {
	let { Discord, client, utils, reloadEvent } = passthrough;

	Object.prototype.sp = function(properties) {
		let list = properties.split(".");
		let result = this;
		list.forEach(p => {
			if (result) result = result[p];
			else result = undefined;
		});
		return result;
	}

	reloadEvent.once(__filename, () => {
		client.removeListener("message", gifDetector);
	});
	client.on("message", gifDetector);
	async function gifDetector(msg) {
		for (let bot of bots) {
			if (msg.author.id == bot[0] && msg.sp("embeds.0.type") == "rich" && msg.sp("embeds.0.image.url")) {
				let existing = await utils.sql.all("SELECT * FROM GenderGifs INNER JOIN GenderGifCharacters ON GenderGifs.gifid = GenderGifCharacters.gifid WHERE url = ?", msg.embeds[0].image.url);
				if (existing.length) return;
				let callingMessage = [...msg.channel.messages.filter(m => m.content.startsWith(bot[1])).values()].slice(-1)[0];
				let command;
				if (callingMessage) {
					command = callingMessage.content.match(/\w+/)[0];
				}
				client.users.get("176580265294954507").send("New "+command+" GIF from "+msg.author.username+":\n"+msg.embeds[0].image.url);
			}
		}
	}

	return {
		"storegif": {
			usage: "<\`gif url\`> <type> <gender> [gender] [...]",
			description: "Store a GIF in the database",
			aliases: ["storegif"],
			category: "admin",
			process: async function(msg, suffix) {
				let allowed = await utils.hasPermission(msg.author, "eval");
				if (!allowed) return msg.channel.send("not you");
				let url = suffix.split("`")[1];
				let words = suffix.split("`")[2].split(" ");
				let type = words[1];
				let characters = words.slice(2);
				let existing = await utils.sql.all("SELECT * FROM GenderGifs INNER JOIN GenderGifCharacters ON GenderGifs.gifid = GenderGifCharacters.gifid WHERE url = ?", url);
				new Promise(async resolve => {
					if (existing.length) {
						let dmsg = await msg.channel.send("That GIF already exists with "+existing.sort((a, b) => (a - b)).map(e => "`"+e.gender+"`").join(", ")+".");
						dmsg.reactionMenu([{emoji: "🗑", ignore: "total", actionType: "js", actionData: async () => {
							await utils.sql.all("DELETE FROM GenderGifs WHERE gifid = ?", existing[0].gifid);
							await msg.channel.send("Deleted. Replacing...");
							resolve();
						}}]);
					} else if (type.length == 1) {
						return msg.channel.send("Pretty sure you don't want to do that.");
					} else resolve();
				}).then(async () => {
					let connection = await utils.getConnection();
					await utils.sql.all("INSERT INTO GenderGifs VALUES (NULL, ?, ?)", [url, type], connection);
					let gifid = (await utils.sql.get("SELECT last_insert_id() AS id", [], connection)).id;
					connection.release();
					await Promise.all(characters.map((c, i) => utils.sql.all("INSERT INTO GenderGifCharacters VALUES (NULL, ?, ?, ?)", [gifid, c, i])));
					msg.channel.send("Done!");
				});
			}
		}
	}
}