let router = require("../router.js");
let admin_info = {
	"evaluate": {
		description: "Evaluates arbitrary javascript in the bot process",
		arguments: "<code>",
		aliases: ["evaluate", "eval"],
		category: "admin"
	},
	"execute": {
		description: "Performs a shell operation",
		arguments: "<shell statement>",
		aliases: ["execute", "exec"],
		category: "admin"
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
		if (!config.owners.includes(msg.author.id)) return msg.channel.send("You don't have eval access");
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
		if (!config.owners.includes(msg.author.id)) return msg.channel.send("You don't have exec access");
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
};