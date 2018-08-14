const Canvas = require("canvas-prebuilt");
const util = require("util");
const fs = require("fs");

module.exports = function(passthrough) {
	const { Discord, client, utils } = passthrough;
	
	async function getWaifuInfo(userID) {
		let [meRow, claimerRow] = await Promise.all([
			utils.sql.get("SELECT waifuID FROM waifu WHERE userID = ?", userID),
			utils.sql.get("SELECT userID, price FROM waifu WHERE waifuID = ?", userID)
		]);
		let claimer = claimerRow ? await client.fetchUser(claimerRow.userID) : undefined;
		let price = claimerRow ? Math.floor(claimerRow.price * 1.25) : 0;
		let waifu = meRow ? await client.fetchUser(meRow.waifuID) : undefined;
		return { claimer, price, waifu };
	}

	return {
		"profile": {
			usage: "<user>",
			description: "Gets the Amanda profile for a user",
			aliases: ["profile"],
			category: "gambling",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`${msg.author.username}, you cannot use this command in DMs`);
				let member = msg.guild.findMember(msg, suffix, true);
				if (member == null) return msg.channel.send(`Couldn't find that user`);
				let money = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, member.id);
				let waifu = await getWaifuInfo(member.id);
				if (!money) {
					await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.id, 5000]);
					await msg.channel.send(`Created user account`);
					money = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, member.id);
				}
				msg.channel.sendTyping();
				let canvas = new Canvas(640, 314);
				let ctx = canvas.getContext("2d", { alpha: false });
				let pfpurl = member.user.displayAvatarURL;
				let coinindex = await utils.sql.all("SELECT * FROM money WHERE userID != ? ORDER BY coins DESC", client.user.id).then(all => all.findIndex(obj => obj.userID == member.id) + 1);
				let waifuindex = await utils.sql.all("SELECT * FROM waifu WHERE userID != ? ORDER BY price DESC", client.user.id).then(all => all.findIndex(obj => obj.waifuID == member.id) + 1);
				let waifustring, moneystring;
				if (waifuindex == 0) waifustring = "Not on waifu lb";
				else waifustring = `#${waifuindex} on waifu lb`;
				if (coinindex == 0) moneystring = "Not on discoin lb";
				else moneystring = `#${coinindex} on discoin lb`;
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
					ctx.font = "bold 23px 'Whitney'";
					ctx.fillStyle = "white";
					ctx.fillText(`@ ${member.user.tag}`, 150, 65);
					ctx.fillText(`${money.coins} discoins`, 150, 95);
					ctx.fillText(`Loves ${waifu.waifu ? waifu.waifu.tag : "nobody"}`, 150, 125);
					ctx.fillText(moneystring, 52, 240);
					ctx.fillText(waifustring, 52, 270);
					let buffer = canvas.toBuffer();
					await msg.channel.send({files: [buffer]});
				});
			}
		}
	}
}