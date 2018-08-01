const Canvas = require("canvas-prebuilt");
const util = require("util");
const fs = require("fs");

module.exports = function(passthrough) {
	const { Discord, client, utils } = passthrough;
	return {
		"profile": {
			usage: "<user>",
			description: "Gets the Amanda profile for a user",
			aliases: ["profile"],
			category: "gambling",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`${msg.author.username}, you cannot use this command in DMs`);
				let member = utils.findMember(msg, suffix, true);
				if (member == null) return msg.channel.send(`Couldn't find that user`);
				let money = await utils.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				if (!money) {
					await utils.sql("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.user.id, 5000]);
					await msg.channel.send(`Created user account`);
					money = await utils.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				}
				msg.channel.sendTyping();
				let canvas = new Canvas(640, 314);
				let ctx = canvas.getContext("2d", { alpha: false });
				let pfpurl = member.user.displayAvatarURL;
				let index = await utils.sql("SELECT * FROM money WHERE userID != ? ORDER BY coins DESC", client.user.id).then(all => all.findIndex(obj => obj.userID == member.id) + 1);
				Promise.all([
					new Promise(resolve => require("request")(pfpurl, { encoding: null }, (e,r,b) => resolve(b))),
					util.promisify(fs.readFile)("./images/profile.png", { encoding: null })
				]).then(async ([avatar, template]) => {
					let templateI = new Canvas.Image();
					templateI.src = template;
					ctx.drawImage(templateI, 0, 0, 640, 314);
					let avatarI = new Canvas.Image();
					avatarI.src = avatar;
					ctx.drawImage(avatarI, 52, 47, 76, 76);
					ctx.font = "bold 25px 'Whitney'";
					ctx.fillStyle = "white";
					ctx.fillText(member.user.tag, 205, 93);
					ctx.fillText(`Discoins:`, 52, 170);
					ctx.fillText(`${money.coins}`, 52, 210);
					ctx.fillText(`Position on leaderboard: ${index}`, 52, 270);
					let buffer = canvas.toBuffer();
					await msg.channel.send({files: [buffer]});
				});
			}
		}
	}
}