const bots = [
	["405208699313848330", "&"],
	["160105994217586689", ">"]
];

module.exports = function(passthrough) {
	let { Discord, client, utils, reloadEvent } = passthrough;

	let cadence = new utils.DMUser("176580265294954507");

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
		let botInfo;
		for (let b of bots) {
			if (msg.author.id == b[0]) botInfo = b;
		}
		if (!botInfo) return;
		if (msg.author.id == botInfo[0] && msg.sp("embeds.0.type") == "rich" && msg.sp("embeds.0.image.url")) {
			let url = msg.embeds[0].image.url;
			let callingMessage = [...msg.channel.messages.filter(m => m.content.startsWith(botInfo[1])).values()].slice(-1)[0];
			if (!callingMessage) return;
			let command = callingMessage.content.match(/\w+/)[0];
			if (!["boop", "cuddle", "hug", "kiss", "nom", "pat", "poke", "slap"].includes(command)) return;
			let existing = await utils.sql.get("SELECT COUNT(*) AS count FROM GenderGifs WHERE url = ?", url);
			if (existing.count) return; // skip if already exists
			let backlog = await utils.sql.all("SELECT url FROM GenderGifBacklog");
			if (backlog.some(r => r.url == url)) return; // skip if already in backlog
			if (!backlog.length) cadence.send("New "+command+" GIF from "+msg.author.username+":\n"+url);
			utils.sql.all("INSERT INTO GenderGifBacklog VALUES (NULL, ?, ?, ?)", [url, command, msg.author.username]);
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
						dmsg.reactionMenu([{emoji: "🗑", ignore: "total", allowedUsers: [msg.author.id], actionType: "js", actionData: async () => {
							await utils.sql.all("DELETE FROM GenderGifs WHERE gifid = ?", existing[0].gifid);
							await msg.channel.send("Deleted. Replacing...");
							resolve();
						}}]);
					} else if (type && type.length == 1) {
						return msg.channel.send("Pretty sure you don't want to do that.");
					} else resolve();
				}).then(async () => {
					if (characters.length) {
						await Promise.all([
							utils.sql.all("DELETE FROM GenderGifBacklog WHERE url = ?", url),
							new Promise(async resolve => {
								let connection = await utils.getConnection();
								await utils.sql.all("INSERT INTO GenderGifs VALUES (NULL, ?, ?)", [url, type], connection);
								let gifid = (await utils.sql.get("SELECT last_insert_id() AS id", [], connection)).id;
								await Promise.all(characters.map((c, i) => utils.sql.all("INSERT INTO GenderGifCharacters VALUES (NULL, ?, ?, ?)", [gifid, c, i])));
								connection.release();
								resolve();
							})
						]);
					} else {
						await msg.channel.send("Note: deleting from backlog, not adding to storage.");
						await utils.sql.all("DELETE FROM GenderGifBacklog WHERE url = ?", url);
					}
					let backlog = await utils.sql.all("SELECT * FROM GenderGifBacklog");
					if (!backlog.length) { // entire backlog dealt with
						await msg.channel.send("Done! Backlog empty.");
					} else { // more images in backlog, send the next
						await msg.channel.send(`Done! ${backlog.length} image${backlog.length == 1 ? "" : "s"} left.`);
						cadence.send(`New ${backlog[0].type} GIF from ${backlog[0].author}:\n${backlog[0].url}`);
					}
				});
			}
		}
	}
}