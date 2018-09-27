module.exports = function(passthrough) {
	let { Discord, client, config, utils, db, commands, reloadEvent } = passthrough;
	let stdin = process.stdin;
	let prefixes = [];
	let statusPrefix = "&";

	if (config.dbl_key) {
		const dbl = require("dblapi.js");
		const poster = new dbl(config.dbl_key, client);
		poster.once("posted", () => console.log("Server count posted"));
		poster.on("error", reason => console.error(reason));
	} else console.log("No DBL API key. Server count posting is disabled.");

	client.on("message", manageMessage);
	client.on("messageUpdate", manageEdit);
	client.once("ready", manageReady);
	client.on("disconnect", manageDisconnect);
	process.on("unhandledRejection", manageRejection);
	stdin.on("data", manageStdin);
	reloadEvent.once(__filename, () => {
		client.removeListener("message", manageMessage);
		client.removeListener("messageUpdate", manageEdit);
		client.removeListener("disconnect", manageDisconnect);
		process.removeListener("unhandledRejection", manageRejection);
		stdin.removeListener("data", manageStdin);
	});

	async function manageStdin(input) {
		input = input.toString();
		try { console.log(await utils.stringify(eval(input))); } catch (e) { console.log(e.stack); }
	}

	async function manageMessage(msg) {
		if (msg.author.bot) return;
		let prefix = prefixes.find(p => msg.content.startsWith(p));
		if (!prefix) return;
		let cmdTxt = msg.content.substring(prefix.length).split(" ")[0];
		let suffix = msg.content.substring(cmdTxt.length + prefix.length + 1);
		let cmd = Object.values(commands).find(c => c.aliases.includes(cmdTxt));
		if (cmd) {
			try {
				await cmd.process(msg, suffix);
			} catch (e) {
				let msgTxt = `command ${cmdTxt} failed <:rip:401656884525793291>\n`+(await utils.stringify(e));
				const embed = new Discord.RichEmbed()
				.setDescription(msgTxt)
				.setColor("B60000")
				msg.channel.send({embed});
			}
		} else {
			if (msg.content.startsWith(`<@${client.user.id}>`) || msg.content.startsWith(`<@!${client.user.id}>`)) {
				let username = msg.guild ? msg.guild.me.displayName : client.user.username;
				let chat = msg.cleanContent.replace(new RegExp('@' + username + ',?'), '').trim();
				msg.channel.sendTyping();
				if (chat.toLowerCase().replace(/'s/gi, " is").includes(`what is your name`) || chat.toLowerCase().includes(`who are you`)) return setTimeout(() => { msg.channel.send(`I'm ${client.user.username}. It's very nice to meet you`); }, 3000);
				if (chat.toLowerCase().includes(`how are you doing`)) return setTimeout(() => { msg.channel.send(`I'm doing pretty ok. How about you?`); }, 3000);
				let owner = await client.fetchUser("320067006521147393");
				if (chat.toLowerCase().includes("who made you") || chat.toLowerCase().replace(/'s/gi, " is").includes("who is your creator")) return setTimeout(() => msg.channel.send(`${owner.tag} made me`), 1300);
				let data;
				try {
					let res = await (require("request-promise")(`https://some-random-api.ml/chatbot/?message=${chat}`));
					data = JSON.parse(res);
					msg.channel.send(data.response);
				} catch (error) { msg.channel.send(error); };
			} else return;
		}
	}

	function manageEdit(oldMessage, newMessage) {
		manageMessage(newMessage);
	}

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

	function manageDisconnect(reason) {
		console.log(`Disconnected with ${reason.code} at ${reason.path}\n\nReconnecting in 6sec`);
		setTimeout(() => client.login(config.bot_token), 6000);
	}

	function manageRejection(reason) {
		if (reason && reason.code) {
			if (reason.code == 10008) return;
			if (reason.code == 50013) return;
		}
		console.error(reason);
	}

	const presences = [
		['alone', 'PLAYING'], ['in a box', 'PLAYING'], ['with fire 🔥', 'PLAYING'], ['dead', 'PLAYING'],
		['anime', 'WATCHING'], ['Netflix', 'WATCHING'], ['YouTube', 'WATCHING'], ['bots take over the world', 'WATCHING'], ['endless space go by', 'WATCHING'], ['cute cat videos', 'WATCHING'],
		['music', 'LISTENING'], ['Spotify', 'LISTENING'],
		['Netflix for ∞ hours', 'STREAMING'],
	];
	const update = () => {
		const [name, type] = presences[Math.floor(Math.random() * presences.length)];
		client.user.setActivity(`${name} | ${statusPrefix}help`, { type, url: 'https://www.twitch.tv/papiophidian/' });
	};

}