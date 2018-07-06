const colors = ["red", "yellow", "gold", "skyblue", "pink", "brown"];
const lengths = ["long", "short"];
const scents = ["grass", "dirt", "flour", "basil"];

module.exports = function(passthrough) {
	let { client, reloadEvent, utils } = passthrough;
	return {
		"pet": {
			usage: "Pet test",
			description: "Pet test description",
			aliases: ["pet", "pets"],
			category: "fun",
			process: async function(msg, suffix) {
				if (!await utils.hasPermission(msg.author, "eval")) return utils.sendNopeMessage(msg);
				let action = suffix.split(" ")[0];
				switch (action) {
				case "create": {
					let args = suffix.split(" ").slice(1);
					let params = [
						args[0][0], // Gender
						parseInt(args[1]), // Colour
						colors.indexOf(args[2]), // Mane
						scents.indexOf(args[3]), // Bag
						lengths.indexOf(args[4]) // Tail
					];
					let connection = await utils.getConnection();
					await utils.sql('INSERT INTO Pets VALUES (NULL, "Lion", ?, ?, ?, ?, ?)', params, connection);
					let id = (await utils.get("SELECT last_insert_id() AS last", [], connection)).last;
					connection.release();
					await utils.sql("INSERT INTO UserPets VALUES (?, ?)", [msg.author.id, id]);
					msg.channel.send("new pet ID: "+id);
				} break;
				case "list": {
					let pets = await utils.sql("SELECT Pets.* FROM Pets INNER JOIN UserPets ON UserPets.petID = Pets.petID");
					if (pets.length) msg.channel.send(await utils.stringify(pets));
					else msg.channel.send("no pets");
				} break;
				case "delete": {
					let id = +suffix.split(" ")[1];
					await Promise.all([
						utils.sql("DELETE FROM Pets WHERE petID = ?", id),
						utils.sql("DELETE FROM UserPets WHERE petID = ?", id)
					]);
					msg.channel.send("ok, deleted");
				} break;
				default: {
					msg.channel.send("usage: &pet (create <gender> <color> <mane> <bag> <tail>|list|delete <id>)");
				} break;
				}
			}
		}
	}
}
