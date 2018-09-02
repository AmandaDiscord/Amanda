let router = require("../router.js");

module.exports = function(passthrough) {
	let { Discord, client, config, utils, db } = passthrough;

	let prefixes = [];
	let statusPrefix = "&";

	if (config.dbl_key) {
		const dbl = require("dblapi.js");
		const poster = new dbl(config.dbl_key, client);
		poster.once("posted", () => console.log("Server count posted"));
		poster.on("error", reason => console.error(reason));
	} else console.log("No DBL API key. Server count posting is disabled.");

	client.once("ready", manageReady);
	client.on("message", manageMessage);
	client.on("messageUpdate", manageEdit);
	client.on("disconnect", manageDisconnect);
	client.on("error", manageError);
	process.on("unhandledRejection", manageRejection);
	process.stdin.on("data", manageStdin);
	router.once(__filename, () => {
		client.removeListener("message", manageMessage);
		client.removeListener("messageUpdate", manageEdit);
		client.removeListener("disconnect", manageDisconnect);
		client.removeListener("error", manageError);
		process.removeListener("unhandledRejection", manageRejection);
		process.stdin.removeListener("data", manageStdin);
	});

	function manageReady() {
		console.log(`Successfully logged in as ${client.user.username}`);
		process.title = client.user.username;
		utils.sql.all("SELECT * FROM AccountPrefixes WHERE userID = ?", [client.user.id]).then(result => {
			prefixes = result.map(r => r.prefix);
			statusPrefix = result.find(r => r.status).prefix;
			console.log("Loaded "+prefixes.length+" prefixes");
			update();
			client.setInterval(update, 300000);
});
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
	function manageError(reason) {
		console.error(reason);
	}

	let presences = [
		['alone', 'PLAYING'], ['in a box', 'PLAYING'], ['with fire 🔥', 'PLAYING'], ["yourself", "PLAYING"], ["despacito 2", "PLAYING"],
		['anime', 'WATCHING'], ['Netflix', 'WATCHING'], ['YouTube', 'WATCHING'], ['bots take over the world', 'WATCHING'], ['endless space go by', 'WATCHING'],
		['music', 'LISTENING'], ['Spootify', 'LISTENING'],
		['with Shodan', 'STREAMING'], [`Netflix for ∞ hours`],
	];
	function update() {
		const [name, type] = presences[Math.floor(Math.random() * presences.length)];
		client.user.setActivity(`${name} | ${statusPrefix}help`, { type, url: 'https://www.twitch.tv/papiophidian/' });
	}
}