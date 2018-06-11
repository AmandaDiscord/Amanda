module.exports = function(passthrough) {
	let { Config, Discord, client, djs, dio, reloadEvent, utils, dbs, commands } = passthrough;
	djs.on("ready", manageReady);
	djs.on("disconnect", manageDisconnect);
	djs.on("message", manageMessage);
	djs.on("messageUpdate", manageEdit);
	reloadEvent.once(__filename, () => {
		djs.removeListener("ready", manageReady);
		djs.removeListener("disconnect", manageDisconnect);
		djs.removeListener("message", manageMessage);
		djs.removeListener("messageUpdate", manageEdit);
	});

	function manageReady() {
		console.log("Successfully logged in");
		update();
		djs.setInterval(update, 300000);
	}

	const presences = [
		['alone', 'PLAYING'], ['in a box', 'PLAYING'], ['with fire', 'PLAYING'],
		['anime', 'WATCHING'], ['Netflix', 'WATCHING'], ['YouTube', 'WATCHING'], ['bots take over the world', 'WATCHING'], ['endless space go by', 'WATCHING'],
		['music', 'LISTENING'], ['Spootify', 'LISTENING'],
		['with Shodan', 'STREAMING'],
	];
	const update = () => {
		const [name, type] = presences[Math.floor(Math.random() * presences.length)];
		djs.user.setActivity(`${name} | ${Config.prefixes[0]}help`, { type, url: 'https://www.twitch.tv/papiophidian/' });
	};

	function manageDisconnect() {
		console.log(`Disconnected with ${reason.code} at ${reason.path}\n\nReconnecting in 6sec`);
		setTimeout(function(){ client.login(Auth.bot_token); }, 6000);
	}

	function manageMessage(msg) {
		checkMessageForCommand(msg, false);
	}

	function manageEdit(oldMessage, newMessage) {
		if (newMessage.editedTimestamp && oldMessage.editedTimestamp != newMessage.editedTimestamp) checkMessageForCommand(newMessage, true);
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
				var msgTxt = `command ${cmdTxt} failed <:rip:401656884525793291>\n`+(await utils.stringify(e));
				const embed = new Discord.RichEmbed()
				.setDescription(msgTxt)
				.setColor("B60000")
				msg.channel.send({embed});
			}
		} else return;
	};

	return {};
}