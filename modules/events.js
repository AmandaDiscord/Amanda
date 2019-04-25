module.exports = function(passthrough) {
	let { Discord, client, config, utils, db, commands, reloadEvent } = passthrough;
	let stdin = process.stdin;
	let prefixes = [];
	let statusPrefix = "&";

	reloadEvent.once(__filename, () => {
		client.removeListener("message", manageMessage);
		client.removeListener("messageUpdate", manageEdit);
		client.removeListener("disconnect", manageDisconnect);
		client.removeListener("error", manageError);
		client.removeListener("voiceStateUpdate", manageVoiceStateUpdate);
		process.removeListener("unhandledRejection", manageRejection);
		stdin.removeListener("data", manageStdin);
	});
	client.on("message", manageMessage);
	client.on("messageUpdate", manageEdit);
	client.once("ready", manageReady);
	client.on("disconnect", manageDisconnect);
	client.on("voiceStateUpdate", manageVoiceStateUpdate);
	process.on("unhandledRejection", manageRejection);
	stdin.on("data", manageStdin);

	async function manageStdin(input) {
		input = input.toString();
		try { console.log(await utils.stringify(eval(input))); } catch (e) { console.log(e.stack); }
	}

	async function manageMessage(msg) {
		if (msg.author.bot) return;
		let prefix = prefixes.find(p => msg.content.startsWith(p));
		if (!prefix) {
			if (msg.guild) {
				let d = await utils.sql.get("SELECT * FROM prefixes WHERE serverID =?", msg.guild.id);
				if (!d) return;
				prefix = d.prefix;
				if (!msg.content.startsWith(prefix)) return;
			} else return;
		}
		let cmdTxt = msg.content.substring(prefix.length).split(" ")[0];
		let suffix = msg.content.substring(cmdTxt.length + prefix.length + 1);
		let cmd = Object.values(commands).find(c => c.aliases.includes(cmdTxt));
		if (cmd) {
			try {
				await cmd.process(msg, suffix);
			} catch (e) {
				if (e && e.code) {
					if (e.code == 10008) return;
					if (e.code == 50013) return;
				}
				// Report to original channel
				let msgTxt = `command ${cmdTxt} failed <:rip:401656884525793291>\n`+(await utils.stringify(e));
				let embed = new Discord.RichEmbed()
				.setDescription(msgTxt)
				.setColor("dd2d2d")
				msg.channel.send({embed});
				// Report to #amanda-error-log
				let reportChannel = client.channels.get("512869106089852949");
				if (reportChannel) {
					embed.setTitle("Command error occurred.");
					let details = [
						["User", msg.author.tag],
						["User ID", msg.author.id],
						["Bot", msg.author.bot ? "Yes" : "No"]
					];
					if (msg.guild) {
						details = details.concat([
							["Guild", msg.guild.name],
							["Guild ID", msg.guild.id],
							["Channel", "#"+msg.channel.name],
							["Channel ID", msg.channel.id]
						]);
					} else {
						details = details.concat([
							["DM", "Yes"]
						]);
					}
					let maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0);
					let detailsString = details.map(row =>
						"`"+row[0]+" ​".repeat(maxLength-row[0].length)+"` "+row[1] //SC: space + zwsp, wide space
					).join("\n");
					embed.addField("Details", detailsString);
					embed.addField("Message content", "```\n"+msg.content.replace(/`/g, "ˋ")+"```"); //SC: IPA modifier grave U+02CB
					reportChannel.send(embed);
				}
			}
		} else {
			if (msg.content.startsWith(`<@${client.user.id}>`) || msg.content.startsWith(`<@!${client.user.id}>`)) {
				let username = msg.guild ? msg.guild.me.displayName : client.user.username;
				let chat = msg.cleanContent.replace(new RegExp('@' + username + ',?'), '').trim();
				if (!chat) return;
				msg.channel.sendTyping();
				let owner = await client.fetchUser("320067006521147393");
				if (chat.toLowerCase().startsWith("say")) return;
				try {
					require("request-promise")(`http://ask.pannous.com/api?input=${encodeURIComponent(chat)}`).then(async res => {
						let data = JSON.parse(res);
						if (!data.sp("output.0.actions")) return msg.channel.send("Terribly sorry but my Ai isn't working as of recently (◕︵◕)\nHopefully, the issue gets resolved soon. Until then, why not try some of my other features?");
						let text = data.output[0].actions.say.text.replace(/Jeannie/gi, client.user.username).replace(/Master/gi, msg.member ? msg.member.displayName : msg.author.username).replace(/Pannous/gi, owner.username);
						if (text.length >= 2000) text = text.slice(0, 1999)+"…";
						if (chat.toLowerCase().includes("ip") && text.match(/(\d{1,3}\.){3}\d{1,3}/)) return msg.channel.send("no");
						if (text == "IE=edge,chrome=1 (Answers.com)" && data.sp("output.0.actions.source.url")) text = "I believe you can find the answer here: "+data.output[0].actions.source.url;
						if (["sex", "fuck", "cock"].find(word => text.toLowerCase().includes(word))) return msg.channel.send(`I think I misunderstood what you said. My response was a bit unprofessional. Let's talk about something else`);
						msg.channel.send(text);
					});
				} catch (error) { msg.channel.send(error); };
			} else return;
		}
	}

	function manageEdit(oldMessage, data) {
		if (data.constructor.name == "Message") manageMessage(data);
		else if (data.content) {
			let channel = client.channels.get(data.channel_id);
			let message = new Discord.Message(channel, data, client);
			manageMessage(message);
		}
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
		if (reason) console.log(`Disconnected with ${reason.code} at ${reason.path}\n\nReconnecting in 6sec`);
		setTimeout(() => client.login(config.bot_token), 6000);
	}

	function manageError(reason) {
		if (reason) console.error(reason);
	}

	function manageRejection(reason) {
		if (reason && reason.code) {
			if (reason.code == 10008) return;
			if (reason.code == 50013) return;
		}
		if (reason) console.error(reason);
		else console.log("There was an error but no reason");
	}
	utils.manageError = manageRejection;

	function manageVoiceStateUpdate(oldMember, newMember) {
		if (newMember.id == client.user.id) return;
		let channel = oldMember.voiceChannel || newMember.voiceChannel;
		if (!channel || !channel.guild) return;
		let queue = utils.queueStorage.storage.get(channel.guild.id);
		if (!queue) return;
		queue.voiceStateUpdate(oldMember, newMember);
	}

	const presences = {
		yearly: [
			['alone', 'PLAYING'], ['in a box', 'PLAYING'], ['with fire 🔥', 'PLAYING'], ['dead', 'PLAYING'],
			['anime', 'WATCHING'], ['Netflix', 'WATCHING'], ['YouTube', 'WATCHING'], ['bots take over the world', 'WATCHING'], ['endless space go by', 'WATCHING'], ['cute cat videos', 'WATCHING'],
			['music', 'LISTENING'], ['Spotify', 'LISTENING'],
			['Netflix for ∞ hours', 'STREAMING']
		],
		newYears: [
			["with sparklers", "PLAYING"],
			["a fireworks show", "WATCHING"], ["Times Square", "WATCHING"], ["the countdown", "WATCHING"],
			["The Final Countdown", "LISTENING"],
			["fire snakes", "STREAMING"]
		],
		halloween: [
			["Silent Hill", "PLAYING"],
			["scary movies", "WATCHING"], ["Halloween decor being hung", "WATCHING"],
			["Thriller by M.J.", "LISTENING"], ["the screams of many", "LISTENING"],
			["Halloween on Netflix", "STREAMING"]
		],
		thanksgiving: [
			["in the leaves", "PLAYING"],
			["people give thanks", "LISTENING"],
			["my family eat a feast", "WATCHING"]
		],
		christmas: [
			["in the snow", "PLAYING"],
			["Christmas carols", "LISTENING"],
			["The Night before Christmas", "WATCHING"], ["snow fall", "WATCHING"],
			["Christmas movies", "STREAMING"]
		]
	};

	const update = () => {
		let now = new Date().toJSON();
		let choice;
		if (now.includes("-10-09")) choice = [["happy age++, Cadence <3", "STREAMING"]]
		else if (now.includes("-10-")) choice = presences.halloween;
		else if (now.includes("-11-22")) choice = presences.thanksgiving;
		else if (now.includes("-12-25")) choice = [["with wrapping paper", "PLAYING"], ["presents being unwrapped", "WATCHING"]];
		else if (now.includes("-12-31")) choice = presences.newYears;
		else if (now.includes("-12-")) choice = presences.christmas;
		else if (now.includes("-01-01")) choice = presences.newYears;
		else if (now.includes("-01-16")) choice = [["at my owner's bday party", "PLAYING"]];
		else choice = presences.yearly;
		const [name, type] = choice[Math.floor(Math.random() * choice.length)];
		client.user.setActivity(`${name} | ${statusPrefix}help`, { type, url: 'https://www.twitch.tv/papiophidian/' });
	};

}
