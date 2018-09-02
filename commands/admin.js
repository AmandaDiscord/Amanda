let router = require("../router.js");
let admin_info = {
	"evaluate": {
		description: "Evaluates arbitrary javascript in the bot process",
		arguments: "<code>",
		aliases: ["evaluate", "eval"],
		category: ["admin", "tools"]
	},
	"execute": {
		description: "Performs a shell operation",
		arguments: "<shell statement>",
		aliases: ["execute", "exec"],
		category: ["admin", "tools"]
	},
	"award": {
		description: "Awards a user discoins",
		arguments: "<amount> <user>",
		aliases: ["award"],
		category: ["admin", "gambling"]
	}
};

router.emit("help", admin_info);
router.on("command", file_admin);
router.once(__filename, () => {
	router.removeListener("command", file_admin);
});
async function file_admin(passthrough) {
	let { Discord, client, msg, cmd, suffix, config, utils } = passthrough;

	if (cmd == "evaluate" || cmd == "eval") {
		let allowed = await utils.hasPermission(msg.author, "eval");
		if (!allowed) return;
		if (!suffix) return msg.channel.send(`You didn't provide any input to evaluate, silly`);
		let result;
		try {
			result = eval(suffix.replace(/client.token/g, `"${config.fake_token}"`));
		} catch (e) {
			result = e;
		}
		let output = await utils.stringify(result);
		let nmsg = await msg.channel.send(output.replace(new RegExp(config.bot_token, "g"), "No"));
		return nmsg.reactionMenu([{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }]);
	}


	else if (cmd == "execute" || cmd == "exec") {
		let allowed = await utils.hasPermission(msg.author, "eval");
		if (!allowed) return;
		if (!suffix) return msg.channel.send("You didn't provide anything to execute, silly");
		await msg.channel.sendTyping();
		require("child_process").exec(suffix, async (error, stdout, stderr) => {
			let result = undefined;
			if (error) {
				if (error.toString("utf8").length >= 2000) result = error.toString("utf8").slice(0, 1998)+"…";
				else result = error;
			}
			if (stderr) {
				if (stderr.toString("utf8").length >= 2000) result = stderr.toString("utf8").slice(0, 1998)+"…";
				else result = stderr;
			}
			if (stdout) {
				if (stdout.toString("utf8").length >= 2000) result = stdout.toString("utf8").slice(0, 1998)+"…";
				else result = stdout;
			}
			let nmsg = await msg.channel.send(`\`\`\`\n${result}\n\`\`\``);
			return nmsg.reactionMenu([{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }]);
		});
	}


	else if (cmd == "award") {
		if (["320067006521147393"].includes(msg.author.id)) {
			if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
			let args = suffix.split(" ");
			if (!args[0]) return msg.channel.send(`${msg.author.username}, you have to provide an amount to award and then a user`);
			if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid amount to award`);
			if (args[0] < 1) return msg.channel.send(`${msg.author.username}, you cannot award an amount less than 1`);
			let usertxt = suffix.slice(args[0].length + 1);
			if (!usertxt) return msg.channel.send(`${msg.author.username}, you need to provide a user to award`);
			let member = msg.guild.findMember(msg, usertxt);
			if (member == null) return msg.channel.send("Could not find that user");
			if (member.user.id == msg.author.id) return msg.channel.send(`You can't award yourself, silly`);
			let target = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
			if (!target) {
				await utils.sql.all("INSERT INTO money (userID, coins) VALUES (?, ?)", [member.user.id, 5000]);
				target = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, member.user.id);
			}
			let award = Math.floor(parseInt(args[0]));
			utils.sql.all(`UPDATE money SET coins =? WHERE userID=?`, [target.coins + award, member.user.id]);
			const embed = new Discord.RichEmbed()
				.setDescription(`**${msg.author.tag}** has awarded ${award} Discoins to **${member.user.tag}**`)
				.setColor("F8E71C")
			msg.channel.send({embed});
			return member.send(`**${msg.author.tag}** has awarded you ${award} <a:Discoin:422523472128901140>`).catch(() => msg.channel.send("I tried to DM that member but they may have DMs disabled from me"));
		} else return;
	}
};