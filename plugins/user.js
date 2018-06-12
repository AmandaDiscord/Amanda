const Canvas = require("canvas");
const util = require("util");
const fs = require("fs");
const mysql = require("mysql");
const db = mysql.createConnection({
	host: 'localhost',
	user: 'Amanda',
	database: 'general'
});

db.connect();

module.exports = function(passthrough) {
	const { Discord, djs, dio, dbs, utils } = passthrough;
	let sql = dbs[0];
	return {
		"profile": {
			usage: "<user>",
			description: "Gets the Amanda profile for a user",
			aliases: ["profile"],
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`${msg.author.username}, you cannot use this command in DMs`);
				var member = utils.findMember(msg, suffix, true);
				if (member == null) return msg.channel.send(`Couldn't find that user`);
				var money = await sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				if (!money) {
					await sql.run("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.user.id, 5000]);
					await msg.channel.send(`Created user account`);
					var money = await sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
				}
				msg.channel.startTyping();
				let canvas = new Canvas.createCanvas(640, 314);
				let ctx = canvas.getContext("2d", { alpha: false });
				var pfpurl =(member.user.avatar)?`https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=128`: member.user.defaultAvatarURL
				Promise.all([
					new Promise(resolve => require("request")(pfpurl, {encoding: null}, (e,r,b) => resolve(b))),
					util.promisify(fs.readFile)("./images/profile.png", { encoding: null })
				]).then(async ([avatar, template]) => {
					let templateI = new Canvas.Image();
					templateI.src = template;
					ctx.drawImage(templateI, 0, 0, 640, 314);
					let avatarI = new Canvas.Image();
					avatarI.src = avatar;
					ctx.drawImage(avatarI, 52, 47, 76, 76);
					ctx.font = "bold 25px 'Whitney'";
					ctx.fillStyle = "white"
					ctx.fillText(member.user.tag, 205, 93);
					ctx.fillText(money.coins, 90, 239);
					ctx.fillText("0", 110, 178)
					let buffer = canvas.toBuffer();
					await msg.channel.send({files: [buffer]});
					msg.channel.stopTyping();
				});
			}
		},

		"mydata": {
			usage: "",
			description: "A command to test MySQL",
			aliases: ["mydata"],
			process: async function(msg, suffix) {
				db.query(`SELECT * FROM money WHERE userID =?`, [msg.author.id], function(reason, row) {
					if (reason) msg.channel.send(reason);
					const embed = new Discord.RichEmbed()
						.setDescription(`**${msg.author.tag}** has ${row.coins} coins`)
					msg.channel.send({embed});
				})
			}
		}
	}
}