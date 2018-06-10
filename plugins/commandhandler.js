module.exports = function(passthrough) {
	let {Config, Discord, djs, dio, reloadEvent, utils, dbs, commands} = passthrough;
	djs.on("message", manageMessage);
	djs.on("messageUpdate", manageEdit);
	reloadEvent.once(__filename, () => {
		djs.removeListener("message", manageMessage);
		djs.removeListener("messageUpdate", manageEdit);
	});

	function manageMessage(msg) {
		checkMessageForCommand(msg, false);
	}
	function manageEdit(oldMessage, newMessage) {
		checkMessageForCommand(newMessage, true);
	}
	async function checkMessageForCommand(msg, isEdit) {
		if (msg.author.bot) return;
		var prefix = Config.prefixes.find(p => msg.content.startsWith(p));
		if (!prefix) return;
		var cmdTxt = msg.content.substring(prefix.length).split(" ")[0];
		var suffix = msg.content.substring(cmdTxt.length + prefix.length + 1);
		var cmd = Object.values(commands).find(c => c.aliases.includes(cmdTxt));
		if (cmd) {
			try {
				await cmd.process(msg, suffix, isEdit);
			} catch (e) {
				var msgTxt = `command ${cmdTxt} failed <:rip:401656884525793291>`;
			if (Config.debug) msgTxt += `\n${e.stack}`;
			else msgTxt += `\n${e}`;
			const embed = new Discord.RichEmbed()
			.setDescription(msgTxt)
			.setColor("B60000")
			msg.channel.send({embed});
			}
		} else return;
	};

	return {};
}