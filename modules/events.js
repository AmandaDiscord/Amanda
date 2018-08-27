let router = require("../router.js");

module.exports = function(passthrough) {
	let { Discord, client, config, utils } = passthrough;

	let prefixes = config.prefixes;

	client.on("ready", manageReady);
	client.on("message", manageMessage);
	client.on("messageUpdate", manageEdit);
	client.on("disconnect", manageDisconnect);
	process.on("unhandledRejection", manageRejection);
	process.stdin.on("data", manageStdin);

	function manageReady() {
		console.log(`Logged in as ${client.user.tag}`);
	}
	function manageMessage(msg) {
		if (msg.author.bot) return;
		let prefix = prefixes.find(p => msg.content.startsWith(p));
		if (!prefix) return;
		let cmd = msg.content.substring(prefix.length).split(" ")[0];
		let suffix = msg.content.substring(cmd.length + prefix.length + 1);
		let pass = { Discord, client, msg, cmd, suffix, config, utils };
		router.emit("command", pass);
	};
	function manageEdit(oldMessage, newMessage) { manageMessage(newMessage); };
	function manageDisconnect(reason) {
		console.log(`Disconnected with ${reason.code} at ${reason.path}\n\nReconnecting in 6sec`);
		setTimeout(() => client.login(config.bot_token), 6000);
	};
	function manageRejection(reason) {
		if (reason.code == 10008) return;
		if (reason.code == 50013) return;
		console.error(reason);
	};
	async function manageStdin(input) {
		input = input.toString();
		try { console.log(await utils.stringify(eval(input))); } catch (e) { console.log(e.stack); }
	};
}